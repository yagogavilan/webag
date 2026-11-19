import { describe, expect, it } from 'vitest';
import { companyIdentity } from './company';
import { DELETION_FACTS_DEFAULT, deletionFacts, factsFromPrivacy } from './public-deletion';

describe('prazos da página pública de exclusão (SEC-178)', () => {
  it('sem variável usa os padrões documentados; com variável válida, muda em um só lugar', () => {
    expect(deletionFacts({})).toEqual(DELETION_FACTS_DEFAULT);
    expect(deletionFacts({ PUBLIC_DELETION_REGRET_HOURS: '48', PUBLIC_DELETION_FISCAL_YEARS: '10' })).toEqual({ ...DELETION_FACTS_DEFAULT, regretHours: 48, fiscalRetentionYears: 10 });
  });

  it('valor inválido, zero ou absurdo cai no padrão', () => {
    expect(deletionFacts({ PUBLIC_DELETION_REGRET_HOURS: 'abc', PUBLIC_DELETION_FISCAL_YEARS: '0', PUBLIC_DELETION_ACCESS_LOG_MONTHS: '99999', PUBLIC_DELETION_ANSWER_DAYS: '-3' })).toEqual(DELETION_FACTS_DEFAULT);
  });
});

describe('prazos vindos da API (SEC-178, W.1)', () => {
  it('o valor da API vale mais que o ambiente; campo ausente cai no ambiente e depois no padrão', () => {
    const api = factsFromPrivacy({ deletionRegretHours: 24, fiscalRetentionYears: 7, accessLogMonths: undefined, privacyAnswerDays: 'x' });
    expect(api).toEqual({ regretHours: 24, fiscalRetentionYears: 7 });
    expect(deletionFacts({ PUBLIC_DELETION_REGRET_HOURS: '48', PUBLIC_DELETION_ACCESS_LOG_MONTHS: '12' }, api)).toEqual({ regretHours: 24, fiscalRetentionYears: 7, accessLogMonths: 12, privacyAnswerDays: 15 });
  });
  it('0 hora de arrependimento só vale vindo da API (exclusão imediata); valor absurdo da API é ignorado', () => {
    expect(deletionFacts({}, { regretHours: 0 }).regretHours).toBe(0);
    expect(deletionFacts({ PUBLIC_DELETION_REGRET_HOURS: '0' }).regretHours).toBe(72);
    expect(deletionFacts({}, { fiscalRetentionYears: 999, accessLogMonths: 1.5 })).toEqual(DELETION_FACTS_DEFAULT);
    expect(factsFromPrivacy(null)).toBeNull();
  });
});

describe('identificação da empresa (variáveis de ambiente)', () => {
  it('só mostra com razão social e CNPJ válidos; senão, nada', () => {
    expect(companyIdentity({})).toBeNull();
    expect(companyIdentity({ COMPANY_LEGAL_NAME: 'Webag Ltda', COMPANY_CNPJ: '123' })).toBeNull();
    expect(companyIdentity({ COMPANY_LEGAL_NAME: 'Webag Ltda', COMPANY_CNPJ: '00.000.000/0001-00' })).toEqual({ legalName: 'Webag Ltda', cnpj: '00.000.000/0001-00' });
    expect(companyIdentity({ COMPANY_LEGAL_NAME: 'Webag Ltda', COMPANY_CNPJ: '12ABC34501DE35' })).not.toBeNull();
  });
});
