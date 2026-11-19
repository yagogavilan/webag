import pg from 'pg';
import { PRIVACY_MAP } from '../src/modules/privacy/privacy-map.js';
import { TEST_ENV } from './test-env.js';

/**
 * SEC-167: teste de classificação. Toda tabela com chave estrangeira para `users.id` precisa ter uma decisão em `PRIVACY_MAP`
 * (`delete` | `anonymize` | `retain:<base>`). Tabela nova com dado do titular quebra o build até alguém decidir (e a anonimização e a
 * exportação passarem a cobri-la, ou a base legal da retenção ser registrada). Lê o catálogo do banco migrado do zero pelo global-setup.
 */
describe('SEC-167: toda tabela ligada a users.id tem decisão de privacidade', () => {
  let client: pg.Client;
  beforeAll(async () => {
    client = new pg.Client({ connectionString: TEST_ENV.databaseUrl });
    await client.connect();
  });
  afterAll(async () => client.end());

  async function tablesWithUserForeignKey(): Promise<string[]> {
    const { rows } = await client.query<{ table_name: string }>(`
      select distinct c.conrelid::regclass::text as table_name
      from pg_constraint c
      where c.contype = 'f' and c.confrelid = 'public.users'::regclass and c.connamespace = 'public'::regnamespace
      order by 1`);
    return rows.map((r) => r.table_name.replace(/^public\./, '').replaceAll('"', ''));
  }

  it('nenhuma tabela com FK para users.id fica sem decisão', async () => {
    const missing = (await tablesWithUserForeignKey()).filter((table) => !(table in PRIVACY_MAP));
    expect(missing, `Classifique em apps/api/src/modules/privacy/privacy-map.ts (delete | anonymize | retain:<base legal>): ${missing.join(', ')}`).toEqual([]);
  });

  it('não sobra decisão de tabela que não existe mais (o mapa não apodrece)', async () => {
    const existing = new Set((await client.query<{ tablename: string }>(`select tablename from pg_tables where schemaname = 'public'`)).rows.map((r) => r.tablename));
    expect(Object.keys(PRIVACY_MAP).filter((table) => !existing.has(table))).toEqual([]);
  });

  it('toda decisão se explica: retenção cita a base, apagar/anonimizar diz o quê, e todas apontam onde o código executa', () => {
    for (const [table, decision] of Object.entries(PRIVACY_MAP)) {
      expect(decision.where.length, `${table}: informe onde o código executa a decisão`).toBeGreaterThan(3);
      expect((decision.kind === 'retain' ? decision.basis : decision.what).length, `${table}: descreva a decisão (retenção: a base legal)`).toBeGreaterThan(10);
    }
  });
});
