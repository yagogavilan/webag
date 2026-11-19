import { describe, expect, it } from 'vitest';
import { companyIdentity } from './company';
import { DELETION_FACTS_DEFAULT, deletionFacts } from './public-deletion';

describe('prazos da página pública de exclusão (SEC-178)', () => {
  it('sem variável usa os padrões documentados; com variável válida, muda em um só lugar', () => {
    expect(deletionFacts({})).toEqual(DELETION_FACTS_DEFAULT);
    expect(deletionFacts({ PUBLIC_DELETION_REGRET_HOURS: '48', PUBLIC_DELETION_FISCAL_YEARS: '10' })).toEqual({ ...DELETION_FACTS_DEFAULT, regretHours: 48, fiscalRetentionYears: 10 });
  });

  it('valor inválido, zero ou absurdo cai no padrão', () => {
    expect(deletionFacts({ PUBLIC_DELETION_REGRET_HOURS: 'abc', PUBLIC_DELETION_FISCAL_YEARS: '0', PUBLIC_DELETION_ACCESS_LOG_MONTHS: '99999', PUBLIC_DELETION_ANSWER_DAYS: '-3' })).toEqual(DELETION_FACTS_DEFAULT);
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
