import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { vi } from 'vitest';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { FakePaymentProvider } from '../src/modules/payments/providers/fake.provider.js';
import { SessionLockService } from '../src/platform/database/database.module.js';
import { paymentAttempts } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { ensureLegalDocs, reconcileFirst, registerUser } from './helpers/fixtures.js';

// A configuração é lida quando o AppModule é importado (ConfigModule.forRoot valida `process.env` nesse momento): o valor tem de existir ANTES dos imports.
const previous = vi.hoisted(() => {
  const old = process.env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS;
  process.env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS = '1000';
  return old;
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * B1 do review de desempenho (2026-11-22) e SEC-199: com `idle_in_transaction_session_timeout` curto o PostgreSQL mata conexões paradas em
 * transação. (1) Isso nunca pode derrubar o processo da API (erro de conexão sem listener = `uncaughtException`); (2) a conciliação, que
 * chama o provedor por candidato durante vários segundos, não pode ficar parada dentro de uma transação, então segue e termina.
 */
describe('Timeout de transação ociosa: a API não cai e a conciliação segue (B1, SEC-199)', () => {
  let ctx: TestContext;
  let payments: PaymentsService;
  let fake: FakePaymentProvider;
  let uncaught: Error[];
  const onUncaught = (error: Error): void => void uncaught.push(error);

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    payments = ctx.app.get(PaymentsService);
    fake = ctx.app.get(FakePaymentProvider);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await ctx.close();
    if (previous === undefined) delete process.env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS;
    else process.env.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS = previous;
  });
  beforeEach(() => {
    uncaught = [];
    process.on('uncaughtException', onUncaught);
  });
  afterEach(() => {
    process.off('uncaughtException', onUncaught);
  });

  it('o servidor realmente aplica o timeout curto configurado (pré-condição do teste)', async () => {
    const { rows } = await ctx.pool.query<{ idle_in_transaction_session_timeout: string }>('show idle_in_transaction_session_timeout');
    expect(rows[0]!.idle_in_transaction_session_timeout).toBe('1s');
  });

  it('A6: os parâmetros de sessão do pool chegam à conexão (a busca por digitação errada depende do limite 0,5)', async () => {
    const { rows } = await ctx.pool.query<{ t: string; s: string }>(`select current_setting('pg_trgm.word_similarity_threshold') as t, current_setting('statement_timeout') as s`);
    expect(rows[0]!.t).toBe('0.5');
    expect(rows[0]!.s).toBe('30s');
  });

  it('transação esquecida aberta é encerrada pelo servidor e o processo continua vivo (o pool descarta a conexão e segue servindo)', async () => {
    const client = await ctx.pool.connect();
    await client.query('begin');
    await client.query('select 1');
    await sleep(1_600); // > 1 s: o PostgreSQL termina a sessão (25P03) e o `pg` emite 'error' neste client
    expect(uncaught).toEqual([]);
    await expect(client.query('select 1')).rejects.toBeDefined();
    client.release(true); // destrói a conexão morta
    const { rows } = await ctx.pool.query<{ ok: number }>('select 1 as ok');
    expect(rows[0]!.ok).toBe(1);
  });

  it('conexão ociosa do pool terminada pelo servidor (reinício, rede) não derruba o processo', async () => {
    const client = await ctx.pool.connect();
    const { rows } = await client.query<{ pid: number }>('select pg_backend_pid() as pid');
    client.release(); // volta ao pool ociosa
    const admin = new pg.Client({ connectionString: process.env.DATABASE_URL }); // conexão à parte: o pool devolveria a própria ociosa
    await admin.connect();
    await admin.query('select pg_terminate_backend($1)', [rows[0]!.pid]);
    await admin.end();
    await sleep(300);
    expect(uncaught).toEqual([]);
    for (let n = 0; n < 3; n += 1) expect((await ctx.pool.query<{ ok: number }>('select 1 as ok')).rows[0]!.ok).toBe(1); // o pool se recompõe
  });

  it('SEC-199: o servidor mata a conexão da trava (pg_terminate_backend) no meio do trabalho: lost() vira true, ninguém derruba o processo, a conexão é descartada e a trava não fica presa', async () => {
    const locks = ctx.app.get(SessionLockService);
    const key = `lost-${randomUUID()}`;
    const seen: boolean[] = [];
    const run = await locks.tryRun(key, async (handle) => {
      seen.push(handle.lost());
      // `pg_try_advisory_lock(bigint)`: classid = 32 bits altos e objid = 32 bits baixos de hashtext(chave) (inteiro de 32 bits com sinal, estendido para 64).
      const { rows } = await ctx.pool.query<{ pid: number }>(
        `select pid from pg_locks where locktype = 'advisory' and granted and objsubid = 1 and ((classid::bigint << 32) | objid::bigint) = hashtext($1)::bigint`,
        [key],
      );
      expect(rows).toHaveLength(1); // a conexão dedicada da trava, e só ela
      await ctx.pool.query('select pg_terminate_backend($1)', [rows[0]!.pid]); // o servidor derruba a sessão (failover, reinício, kill)
      await vi.waitFor(() => expect(handle.lost()).toBe(true), { timeout: 5_000 }); // o `pg` emite 'error' no client; a trava avisa quem trabalha
      seen.push(handle.lost());
      return 'terminou';
    });
    expect(run).toEqual({ acquired: true, value: 'terminou' });
    expect(seen).toEqual([false, true]);
    expect(uncaught).toEqual([]);
    // a conexão morta foi destruída (não devolvida ao pool): o pool segue servindo e a mesma trava pode ser obtida de novo
    for (let n = 0; n < 3; n += 1) expect((await ctx.pool.query<{ ok: number }>('select 1 as ok')).rows[0]!.ok).toBe(1);
    const again = await locks.tryRun(key, () => Promise.resolve('de novo'));
    expect(again).toEqual({ acquired: true, value: 'de novo' });
    const { rows } = await ctx.pool.query<{ held: number }>(`select count(*)::int as held from pg_locks where locktype = 'advisory' and granted and database = (select oid from pg_database where datname = current_database())`);
    expect(rows[0]!.held).toBe(0);
  });

  it('a conciliação com provedor lento (várias vezes o timeout) termina, o processo vive e a trava segue válida até o fim', async () => {
    const auth = bearer((await registerUser(ctx)).accessToken);
    const ids: string[] = [];
    for (let n = 0; n < 3; n += 1) {
      const pix = (await ctx.http.post('/v1/dev/payments').set(auth).send({ amountCents: 5000, method: 'pix', storeId: randomUUID(), applicationFeeCents: 500, externalReference: `order-${randomUUID()}` }).expect(201)).body as { id: string };
      ids.push(pix.id);
    }
    const mine = new Set<string>();
    for (const id of ids) mine.add((await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.id, id)))[0]!.providerPaymentId!);
    const at = new Date(Date.now() + 10 * 60_000); // pendentes "há mais de 5 min"
    await reconcileFirst(ctx, ...ids);

    // O "provedor" demora 1,2 s só nos pagamentos deste teste: 3 x 1,2 s = 3,6 s dentro da conciliação, bem acima do timeout de 1 s.
    const real = fake.getPayment.bind(fake);
    const spy = vi.spyOn(fake, 'getPayment').mockImplementation(async (id) => {
      if (mine.has(id)) await sleep(1_200);
      return real(id);
    });

    const running = payments.reconcile(at);
    await sleep(1_700); // já passou do timeout de transação ociosa com a conciliação em andamento
    const concurrent = await payments.reconcile();
    expect(concurrent).toMatchObject({ skipped: true, checked: 0 }); // a trava continua de pé: outra instância não concilia junto
    const result = await running;
    expect(result.skipped).toBeUndefined();
    expect(result.failures).toBe(0);
    expect(result.checked).toBeGreaterThanOrEqual(3);
    expect(spy.mock.calls.filter(([id]) => mine.has(id)).length).toBe(3); // todos os candidatos foram consultados
    expect(uncaught).toEqual([]);

    // trava liberada ao final (sem vazar na conexão devolvida ao pool): a próxima conciliação roda
    expect((await payments.reconcile(at)).skipped).toBeUndefined();
    const { rows } = await ctx.pool.query<{ held: number }>(`select count(*)::int as held from pg_locks where locktype = 'advisory' and granted and database = (select oid from pg_database where datname = current_database())`);
    expect(rows[0]!.held).toBe(0);
  }, 30_000);
});
