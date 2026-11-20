import { describe, expect, it } from 'vitest';
import { PENDING, fillCompanyVariables, forbiddenLegalVariables, resolveCompanyValues } from './legal-variables.js';

describe('forbiddenLegalVariables (SEC-187)', () => {
  it('aceita só SITE_URL, VERSAO e VIGENCIA, com ou sem espaços', () => {
    expect(forbiddenLegalVariables('Veja {{SITE_URL}}/termos. Versão {{ VERSAO }}. Em vigor desde {{VIGENCIA}}.')).toEqual([]);
    expect(forbiddenLegalVariables('Texto sem variável nenhuma.')).toEqual([]);
  });

  it('recusa variável de empresa, desconhecida, em minúscula, malformada ou com chave solta', () => {
    expect(forbiddenLegalVariables('Foro {{FORO_COMARCA}} e {{ DPO_EMAIL }}')).toEqual(['{{FORO_COMARCA}}', '{{ DPO_EMAIL }}']);
    expect(forbiddenLegalVariables('{{site_url}}')).toEqual(['{{site_url}}']);
    expect(forbiddenLegalVariables('{{SITE_URL}')).toHaveLength(1);
    expect(forbiddenLegalVariables('sobrou }} aqui')).toHaveLength(1);
    expect(forbiddenLegalVariables('{{SITE_URL {{VERSAO}}')).toHaveLength(1);
    expect(forbiddenLegalVariables('{{}}')).toEqual(['{{}}']);
  });
});

describe('resolveCompanyValues / fillCompanyVariables', () => {
  const env = { COMPANY_NAME: 'Webag Exemplo Ltda', COMPANY_CNPJ: '00.000.000/0001-00', DPO_EMAIL: 'dpo@webag.example', DPO_NAME: 'Fulana', FORO_COMARCA: 'Comarca X', AVISO_MUDANCA_DIAS: '15', SUPPORT_WHATSAPP: '5511999990000' };

  it('lê o ambiente, formata o WhatsApp e marca como "a definir" o que falta (sem inventar)', () => {
    const { values, pending } = resolveCompanyValues(env);
    expect(values).toMatchObject({ COMPANY_NAME: 'Webag Exemplo Ltda', COMPANY_CNPJ: '00.000.000/0001-00', DPO_EMAIL: 'dpo@webag.example', FORO_COMARCA: 'Comarca X', AVISO_MUDANCA_DIAS: '15', SUPPORT_WHATSAPP: '(11) 99999-0000', COMPANY_ADDRESS: PENDING });
    expect(pending).toContain('COMPANY_ADDRESS');
    expect(pending).not.toContain('FORO_COMARCA');
    expect(resolveCompanyValues({}).pending).toHaveLength(12);
  });

  it('nome antigo COMPANY_LEGAL_NAME e WhatsApp público valem como alternativa', () => {
    expect(resolveCompanyValues({ COMPANY_LEGAL_NAME: 'Antiga Ltda' }).values.COMPANY_NAME).toBe('Antiga Ltda');
    expect(resolveCompanyValues({ NEXT_PUBLIC_SUPPORT_WHATSAPP: '11988887777' }).values.SUPPORT_WHATSAPP).toBe('(11) 98888-7777');
  });

  it('e-mail, CNPJ e dias inválidos não entram', () => {
    const { values } = resolveCompanyValues({ DPO_EMAIL: 'nao-e-email', SUPPORT_EMAIL: '**x**@a.co', COMPANY_CNPJ: 'x', AVISO_MUDANCA_DIAS: '9999' });
    expect(values).toMatchObject({ DPO_EMAIL: PENDING, SUPPORT_EMAIL: PENDING, COMPANY_CNPJ: PENDING, AVISO_MUDANCA_DIAS: PENDING });
  });

  it('valor do ambiente não vira Markdown nem outra variável, e o resultado não tem variável de empresa', () => {
    const { values } = resolveCompanyValues({ FORO_COMARCA: '**Foro** [x](https://evil.test) {{VERSAO}}\n## título', COMPANY_ADDRESS: '## Rua' });
    expect(values.FORO_COMARCA).not.toMatch(/[*[\]{}\n]/);
    expect(values.COMPANY_ADDRESS).toBe('Rua');
    const out = fillCompanyVariables('Foro {{FORO_COMARCA}}. {{ DPO_EMAIL }}. {{SITE_URL}} v{{VERSAO}}.', values);
    expect(out).toContain('{{SITE_URL}} v{{VERSAO}}');
    expect(forbiddenLegalVariables(out)).toEqual([]);
  });
});
