import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PENDING, fillLegalText, formatVigencia, formatWhatsapp, headingId, legalReviewed, legalStructure, legalVariables } from './legal-text';

const doc = { version: 3, effectiveAt: '2026-12-05T03:00:00.000Z' };
const site = 'https://webag.example';

describe('legalReviewed', () => {
  it('só "true" libera; ausente, vazio ou outra coisa continua em revisão', () => {
    expect(legalReviewed({ LEGAL_REVIEWED: 'true' })).toBe(true);
    expect(legalReviewed({ LEGAL_REVIEWED: ' TRUE ' })).toBe(true);
    for (const value of [undefined, '', 'false', '1', 'yes']) expect(legalReviewed({ LEGAL_REVIEWED: value })).toBe(false);
  });
});

describe('legalVariables', () => {
  const env = { COMPANY_NAME: 'Webag Exemplo Ltda', COMPANY_CNPJ: '00.000.000/0001-00', DPO_EMAIL: 'dpo@webag.example', DPO_NAME: 'Fulana', FORO_COMARCA: 'Comarca X', AVISO_MUDANCA_DIAS: '15', SUPPORT_WHATSAPP: '5511999990000' };

  it('lê empresa, encarregado, comarca e contatos do ambiente; domínio e versão vêm de fora', () => {
    const vars = legalVariables({ env, doc, siteUrl: site });
    expect(vars).toMatchObject({ COMPANY_NAME: 'Webag Exemplo Ltda', COMPANY_CNPJ: '00.000.000/0001-00', DPO_EMAIL: 'dpo@webag.example', DPO_NAME: 'Fulana', FORO_COMARCA: 'Comarca X', AVISO_MUDANCA_DIAS: '15', SUPPORT_WHATSAPP: '(11) 99999-0000', SITE_URL: site, VERSAO: '3' });
  });

  it('o nome antigo COMPANY_LEGAL_NAME continua valendo; sem valor, a variável vira "a definir" (nada inventado)', () => {
    expect(legalVariables({ env: { COMPANY_LEGAL_NAME: 'Antiga Ltda', COMPANY_CNPJ: '00.000.000/0001-00' }, doc, siteUrl: site }).COMPANY_NAME).toBe('Antiga Ltda');
    const empty = legalVariables({ env: {}, doc, siteUrl: site });
    for (const key of ['COMPANY_NAME', 'COMPANY_CNPJ', 'COMPANY_ADDRESS', 'DPO_EMAIL', 'FORO_COMARCA', 'HOSTING_PROVIDER', 'MP_LEGAL_NAME', 'AVISO_MUDANCA_DIAS']) expect(empty[key]).toBe(PENDING);
  });

  it('e-mail, CNPJ e dias inválidos não entram; contato da API só vale quando o ambiente não define', () => {
    const bad = legalVariables({ env: { DPO_EMAIL: 'nao-e-email', COMPANY_CNPJ: 'x', COMPANY_NAME: 'A', AVISO_MUDANCA_DIAS: '9999' }, doc, siteUrl: site });
    expect(bad).toMatchObject({ DPO_EMAIL: PENDING, COMPANY_CNPJ: PENDING, AVISO_MUDANCA_DIAS: PENDING });
    const help = { officerEmail: 'api@webag.example', officerName: 'Da API', supportEmail: 'ajuda@webag.example', supportWhatsapp: '11988887777' };
    expect(legalVariables({ env: {}, doc, siteUrl: site, help })).toMatchObject({ DPO_EMAIL: 'api@webag.example', DPO_NAME: 'Da API', SUPPORT_EMAIL: 'ajuda@webag.example', SUPPORT_WHATSAPP: '(11) 98888-7777' });
    expect(legalVariables({ env: { DPO_EMAIL: 'env@webag.example' }, doc, siteUrl: site, help }).DPO_EMAIL).toBe('env@webag.example');
  });

  it('valor do ambiente não vira Markdown nem chave de variável (negrito, link, título, {{ }})', () => {
    const vars = legalVariables({ env: { COMPANY_NAME: '**Ltda** [x](https://evil.test) {{VERSAO}}\n## título', COMPANY_CNPJ: '00.000.000/0001-00' }, doc, siteUrl: site });
    expect(vars.COMPANY_NAME).toBe('Ltda x (https://evil.test) VERSAO ## título');
    expect(vars.COMPANY_NAME).not.toMatch(/[*[\]{}\n]/);
    // no começo de linha, "##" ou "-" do valor também não vira título nem lista
    expect(legalVariables({ env: { COMPANY_NAME: '## Ltda', COMPANY_CNPJ: '00.000.000/0001-00' }, doc, siteUrl: site }).COMPANY_NAME).toBe('Ltda');
    expect(fillLegalText('{{COMPANY_NAME}}', vars)).not.toContain('{{');
  });

  it('VIGENCIA: em revisão é sempre "a definir", mesmo com LEGAL_VIGENCIA; aprovado usa LEGAL_VIGENCIA ou a data da versão publicada', () => {
    expect(legalVariables({ env: { LEGAL_VIGENCIA: '2025-12-31' }, doc, siteUrl: site }).VIGENCIA).toBe(PENDING);
    expect(legalVariables({ env: { LEGAL_REVIEWED: 'true' }, doc, siteUrl: site }).VIGENCIA).toBe('5 de dezembro de 2026');
    expect(legalVariables({ env: { LEGAL_REVIEWED: 'true', LEGAL_VIGENCIA: '2027-01-10' }, doc, siteUrl: site }).VIGENCIA).toBe('10 de janeiro de 2027');
    expect(legalVariables({ env: { LEGAL_REVIEWED: 'true', LEGAL_VIGENCIA: 'amanhã' }, doc, siteUrl: site }).VIGENCIA).toBe('5 de dezembro de 2026');
  });
});

describe('fillLegalText', () => {
  it('troca todas as ocorrências; variável desconhecida ou sem valor vira "a definir", nunca "{{...}}"', () => {
    const out = fillLegalText('A {{COMPANY_NAME}} e a {{COMPANY_NAME}}; {{DESCONHECIDA}} e {{ DPO_EMAIL }}.', { COMPANY_NAME: 'X', DPO_EMAIL: 'a@b.co' });
    expect(out).toBe('A X e a X; a definir e a@b.co.');
  });

  it('em revisão, "Em vigor desde {{VIGENCIA}}" vira "Vigência a definir"; aprovado mantém a data', () => {
    const text = 'Versão {{VERSAO}}. Em vigor desde {{VIGENCIA}}.';
    expect(fillLegalText(text, { VERSAO: '2', VIGENCIA: PENDING })).toBe('Versão 2. Vigência a definir.');
    expect(fillLegalText(text, { VERSAO: '2', VIGENCIA: '5 de dezembro de 2026' })).toBe('Versão 2. Em vigor desde 5 de dezembro de 2026.');
  });
});

describe('formatos', () => {
  it('WhatsApp e vigência', () => {
    expect(formatWhatsapp('5511999990000')).toBe('(11) 99999-0000');
    expect(formatWhatsapp('1133334444')).toBe('(11) 3333-4444');
    expect(formatWhatsapp('123')).toBeNull();
    expect(formatVigencia('2026-11-20')).toBe('20 de novembro de 2026');
    expect(formatVigencia('lixo')).toBeNull();
  });
});

describe('legalStructure', () => {
  it('âncoras estáveis pelo número da seção e índice só com os títulos "##"', () => {
    expect(headingId('3. Sua conta', 4)).toBe('secao-3');
    expect(headingId('3.1 Dados', 5)).toBe('secao-3-1');
    expect(headingId('Sem número', 7)).toBe('secao-t7');
    const { toc, ids } = legalStructure('## 1. A\n\ntexto\n\n### 1.1 B\n\n## 2. C\n\n## 2. C repetida');
    expect(toc.map((t) => t.id)).toEqual(['secao-1', 'secao-2', 'secao-2-b']);
    expect([...ids.values()]).toEqual(['secao-1', 'secao-1-1', 'secao-2', 'secao-2-b']);
  });
});

describe('textos propostos (DEC-080): seed da API renderizado pelo site', () => {
  // vitest roda na raiz de apps/web
  const dir = resolve(process.cwd(), '../api/seed/legal') + '/';
  const files = ['customer_terms', 'merchant_terms', 'privacy', 'exchange_policy'];

  it.each(files)('%s: sem variável solta com ambiente vazio, seções numeradas com âncoras únicas e links só https', (type) => {
    const raw = readFileSync(`${dir}${type}.md`, 'utf8');
    const vars = legalVariables({ env: {}, doc, siteUrl: site });
    const filled = fillLegalText(raw, vars);
    expect(filled).not.toMatch(/\{\{|REVISAR/);
    const { blocks, ids, toc } = legalStructure(filled);
    expect(toc.length).toBeGreaterThanOrEqual(10);
    expect(toc.every((t) => /^\d+\. /.test(t.label))).toBe(true);
    expect(new Set(ids.values()).size).toBe(ids.size);
    expect(blocks.some((b) => b.kind === 'h2' && /^\d+\. .*vigência$/.test(b.text))).toBe(true);
    expect(filled).toContain('Vigência a definir');
    for (const [, url] of filled.matchAll(/\]\(([^)\s]+)\)/g)) expect(url).toMatch(/^(https:\/\/|mailto:)/);
  });
});
