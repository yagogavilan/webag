// SEC-187 (texto legal publicado é imutável: só {{SITE_URL}}, {{VERSAO}} e {{VIGENCIA}} podem ficar como variável), pela API real. G4 final (tip 036e791). Cria uma versão nova de exchange_policy no banco de TESTE.
// Uso: API_URL=... PG_CONTAINER=... QA_TOTP_FILE=... node docs/qa/retestes/sec187.mjs
import { adminCall, record, finish, sql } from './lib.mjs';
const body = (content) => ({ title: 'Política de Trocas e Reembolsos', content, effectiveAt: '2027-01-01T00:00:00.000Z', relevantChange: false });
const before = sql(`select count(*) from legal_documents where type='exchange_policy'`);
const bad = await adminCall('POST', '/v1/admin/legal/exchange_policy', body('## 1. Teste\n\nA empresa {{COMPANY_CNPJ}} e o encarregado {{DPO_EMAIL}} respondem em 24 horas.'));
record('SEC187-1', 'publicar texto com variável de fato contratual ({{COMPANY_CNPJ}}) = 422 LEGAL_VARIABLE_NOT_ALLOWED', bad.status === 422 && bad.data?.code === 'LEGAL_VARIABLE_NOT_ALLOWED', `HTTP ${bad.status} ${bad.data?.code} ${JSON.stringify(bad.data?.errors ?? []).slice(0, 140)}`);
record('SEC187-2', 'a recusa não criou versão nova', sql(`select count(*) from legal_documents where type='exchange_policy'`) === before, `antes=${before}`);
const ok = await adminCall('POST', '/v1/admin/legal/exchange_policy', body('## 1. Teste\n\nVigência {{VIGENCIA}} na versão {{VERSAO}} em {{SITE_URL}}; a loja responde em 24 horas.'));
record('SEC187-3', 'variáveis de exibição ({{VIGENCIA}}, {{VERSAO}}, {{SITE_URL}}) são aceitas: 201 versão nova', [200, 201].includes(ok.status) && ok.data?.version === Number(before) + 1, `HTTP ${ok.status} v${ok.data?.version}`);
const list = await adminCall('GET', '/v1/admin/legal/exchange_policy');
record('SEC187-4', 'a versão 1 publicada segue intacta e a lista mostra as 2 versões', (list.data?.data?.length ?? 0) === Number(before) + 1, `versões=${list.data?.data?.length}`);
finish();
