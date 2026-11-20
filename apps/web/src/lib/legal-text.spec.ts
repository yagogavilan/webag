import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PENDING, fillLegalText, formatVigencia, headingId, legalReviewed, legalStructure, legalVariables } from './legal-text';

const doc = { version: 3, effectiveAt: '2026-12-05T03:00:00.000Z' };
const site = 'https://webag.example';

describe('legalReviewed', () => {
  it('só "true" libera; ausente, vazio ou outra coisa continua em revisão', () => {
    expect(legalReviewed({ LEGAL_REVIEWED: 'true' })).toBe(true);
    expect(legalReviewed({ LEGAL_REVIEWED: ' TRUE ' })).toBe(true);
    for (const value of [undefined, '', 'false', '1', 'yes']) expect(legalReviewed({ LEGAL_REVIEWED: value })).toBe(false);
  });
});

describe('legalVariables (SEC-187: só SITE_URL, VERSAO e VIGENCIA; nada de empresa vem do ambiente)', () => {
  const company = { COMPANY_NAME: 'Webag Exemplo Ltda', COMPANY_CNPJ: '00.000.000/0001-00', DPO_EMAIL: 'dpo@webag.example', DPO_NAME: 'Fulana', FORO_COMARCA: 'Comarca X', AVISO_MUDANCA_DIAS: '15', SUPPORT_WHATSAPP: '5511999990000' };

  it('devolve só as três variáveis de exibição; o ambiente da empresa é ignorado', () => {
    const vars = legalVariables({ env: company, doc, siteUrl: site });
    expect(Object.keys(vars).sort()).toEqual(['SITE_URL', 'VERSAO', 'VIGENCIA']);
    expect(vars).toMatchObject({ SITE_URL: site, VERSAO: '3' });
  });

  it('variável de empresa que sobrar numa versão antiga vira "a definir", nunca o valor do ambiente', () => {
    const vars = legalVariables({ env: company, doc, siteUrl: site });
    const out = fillLegalText('Foro: {{FORO_COMARCA}}. Encarregado: {{DPO_EMAIL}}. Versão {{VERSAO}}.', vars);
    expect(out).toBe('Foro: a definir. Encarregado: a definir. Versão 3.');
    expect(out).not.toContain('Comarca X');
  });

  it('VIGENCIA: em revisão é sempre "a definir"; aprovado é a data da versão publicada (LEGAL_VIGENCIA não vale mais)', () => {
    expect(legalVariables({ env: { LEGAL_VIGENCIA: '2025-12-31' }, doc, siteUrl: site }).VIGENCIA).toBe(PENDING);
    expect(legalVariables({ env: { LEGAL_REVIEWED: 'true' }, doc, siteUrl: site }).VIGENCIA).toBe('5 de dezembro de 2026');
    expect(legalVariables({ env: { LEGAL_REVIEWED: 'true', LEGAL_VIGENCIA: '2027-01-10' }, doc, siteUrl: site }).VIGENCIA).toBe('5 de dezembro de 2026');
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
  it('vigência', () => {
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
