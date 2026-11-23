import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { TEST_ENV } from './test-env.js';

/**
 * v1.1 R2.1 (ADR-019): o que o BANCO garante, sem o motor (que é da R2.2). Cada regra de dinheiro tem uma 2ª camada em CHECK, índice único ou gatilho:
 * mesmo com bug no serviço, o orçamento não passa do total nem do dia, a reserva não devolve duas vezes, o diário não é editado e a primeira compra não é
 * consumida duas vezes pelo mesmo identificador. A "reserva" abaixo é o SQL de REFERÊNCIA do ADR-019 D4 (a R2.2 o implementa no repositório), aqui só para provar
 * a concorrência (C-CUP-02, C-CUP-03, C-CUP-04) no nível do schema. Quase tudo roda em transação com ROLLBACK; só a prova de concorrência grava de verdade e limpa depois.
 */
const URL = TEST_ENV.databaseUrl;
let client: pg.Client;
let userId: string;
let storeId: string;

const hex = (c: string): string => c.repeat(64);

async function inTx<T>(fn: () => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    return await fn();
  } finally {
    await client.query('ROLLBACK');
  }
}
/** Executa um comando que DEVE falhar dentro de um SAVEPOINT (a transação continua utilizável) e devolve o código SQLSTATE. */
async function failsWith(sql: string, params: unknown[] = []): Promise<string> {
  await client.query('SAVEPOINT t');
  try {
    await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT t');
    return 'ok';
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT t');
    return (error as { code?: string }).code ?? 'sem-codigo';
  }
}
const CHECK = '23514';
const UNIQUE = '23505';
const RESTRICT = '23001'; // restrict_violation: o gatilho append-only (webag_forbid_mutation)

const campaignSql = (over: Record<string, string> = {}): { sql: string; params: unknown[] } => {
  const row: Record<string, string> = {
    name: `'Campanha de teste'`, funding_source: `'webag'`, store_share_pct: '0', kind: `'fixed'`, value: '800', state: `'active'`,
    starts_at: 'now()', ends_at: `now() + interval '30 days'`, budget_total_cents: '10000', budget_daily_cents: '5000', ...over,
  };
  return { sql: `INSERT INTO campaigns (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).join(', ')}) RETURNING id`, params: [] };
};
async function newCampaign(over: Record<string, string> = {}): Promise<string> {
  const { sql } = campaignSql(over);
  return (await client.query<{ id: string }>(sql)).rows[0]!.id;
}

beforeAll(async () => {
  client = new pg.Client({ connectionString: URL });
  await client.connect();
  userId = (await client.query<{ id: string }>(`INSERT INTO users (email, name) VALUES ($1, 'R2 schema') RETURNING id`, [`r2-schema-${randomUUID()}@example.invalid`])).rows[0]!.id;
  storeId = (await client.query<{ id: string }>(`INSERT INTO stores (owner_user_id, document_type, document_number) VALUES ($1, 'cpf', '00000000000') RETURNING id`, [userId])).rows[0]!.id;
});
afterAll(async () => {
  await client.end();
});

describe('R2.1: campanha (regras de custo no banco, DEC-088)', () => {
  it('só as 4 fontes, com a parte da loja coerente (webag 0, store 100, split 1 a 99, self_funded 0)', async () => {
    await inTx(async () => {
      expect(await failsWith(campaignSql({ funding_source: `'webag'`, store_share_pct: '50' }).sql)).toBe(CHECK);
      expect(await failsWith(campaignSql({ funding_source: `'split'`, store_share_pct: '0' }).sql)).toBe(CHECK);
      expect(await failsWith(campaignSql({ funding_source: `'split'`, store_share_pct: '100' }).sql)).toBe(CHECK);
      expect(await failsWith(campaignSql({ funding_source: `'self_funded'`, store_share_pct: '10' }).sql)).toBe(CHECK);
      expect(await failsWith(campaignSql({ funding_source: `'fake_coupon'` }).sql)).not.toBe('ok'); // não existe quinta fonte (DEC-088)
      expect(await failsWith(campaignSql({ funding_source: `'split'`, store_share_pct: '40' }).sql)).toBe('ok');
      expect(await failsWith(campaignSql({ funding_source: `'self_funded'`, store_share_pct: '0' }).sql)).toBe('ok');
    });
  });

  it('frete grátis só com Webag ou Autofinanciado (WB-340 C3: "O frete é da Webag")', async () => {
    await inTx(async () => {
      const freight = { kind: `'free_shipping'`, value: '0' };
      expect(await failsWith(campaignSql({ ...freight, funding_source: `'store'`, store_share_pct: '100' }).sql)).toBe(CHECK);
      expect(await failsWith(campaignSql({ ...freight, funding_source: `'split'`, store_share_pct: '40' }).sql)).toBe(CHECK);
      expect(await failsWith(campaignSql({ ...freight, funding_source: `'webag'` }).sql)).toBe('ok');
      expect(await failsWith(campaignSql({ ...freight, funding_source: `'self_funded'`, store_share_pct: '0' }).sql)).toBe('ok');
    });
  });

  it('sair de rascunho exige orçamento total e diário (custo da Webag) e o limite de usos OU o orçamento', async () => {
    await inTx(async () => {
      expect(await failsWith(campaignSql({ budget_daily_cents: 'null' }).sql)).toBe(CHECK); // C4
      expect(await failsWith(campaignSql({ budget_total_cents: 'null' }).sql)).toBe(CHECK);
      expect(await failsWith(campaignSql({ state: `'draft'`, budget_total_cents: 'null', budget_daily_cents: 'null', starts_at: 'null', ends_at: 'null' }).sql)).toBe('ok'); // rascunho salva sem nada
      // Loja paga não gasta dinheiro da Webag: sem orçamento, mas exige o limite de usos (C6).
      const store = { funding_source: `'store'`, store_share_pct: '100', budget_total_cents: 'null', budget_daily_cents: 'null' };
      expect(await failsWith(campaignSql(store).sql)).toBe(CHECK);
      expect(await failsWith(campaignSql({ ...store, max_uses: '50' }).sql)).toBe('ok');
    });
  });

  it('percentual com custo da Webag exige o teto em R$ (WB-340 C12); no Autofinanciado e na Loja paga o teto é opcional', async () => {
    await inTx(async () => {
      const pct = { kind: `'percent'`, value: '10' };
      expect(await failsWith(campaignSql({ ...pct, funding_source: `'webag'` }).sql)).toBe(CHECK);
      expect(await failsWith(campaignSql({ ...pct, funding_source: `'split'`, store_share_pct: '40' }).sql)).toBe(CHECK);
      expect(await failsWith(campaignSql({ ...pct, funding_source: `'webag'`, percent_cap_cents: '1500' }).sql)).toBe('ok');
      expect(await failsWith(campaignSql({ ...pct, funding_source: `'self_funded'`, store_share_pct: '0' }).sql)).toBe('ok');
      expect(await failsWith(campaignSql({ ...pct, funding_source: `'store'`, store_share_pct: '100', budget_total_cents: 'null', budget_daily_cents: 'null', max_uses: '5' }).sql)).toBe('ok');
      expect(await failsWith(campaignSql({ kind: `'fixed'`, value: '800', percent_cap_cents: '1500' }).sql)).toBe(CHECK); // teto só existe no percentual
    });
  });

  it('cupom da loja: a fonte é da loja (100%), alvo na própria loja e nunca frete', async () => {
    await inTx(async () => {
      const own = { owner: `'store'`, owner_store_id: `'${storeId}'`, funding_source: `'store'`, store_share_pct: '100', target_kind: `'store'`, target_store_id: `'${storeId}'`, budget_total_cents: 'null', budget_daily_cents: 'null', max_uses: '10' };
      expect(await failsWith(campaignSql(own).sql)).toBe('ok');
      expect(await failsWith(campaignSql({ ...own, funding_source: `'webag'`, store_share_pct: '0' }).sql)).toBe(CHECK);
      expect(await failsWith(campaignSql({ ...own, target_kind: `'all'`, target_store_id: 'null' }).sql)).toBe(CHECK);
      expect(await failsWith(campaignSql({ ...own, owner_store_id: 'null' }).sql)).toBe(CHECK);
      expect(await failsWith(campaignSql({ ...own, kind: `'free_shipping'`, value: '0' }).sql)).toBe(CHECK);
    });
  });

  it('o orçamento nunca passa do total, do dia nem dos usos (invariante em CHECK) e o contador não fica negativo', async () => {
    await inTx(async () => {
      const id = await newCampaign({ max_uses: '3' });
      expect(await failsWith(`UPDATE campaigns SET budget_reserved_cents = 10001 WHERE id = $1`, [id])).toBe(CHECK);
      expect(await failsWith(`UPDATE campaigns SET budget_reserved_cents = 6000, budget_spent_cents = 4001 WHERE id = $1`, [id])).toBe(CHECK);
      expect(await failsWith(`UPDATE campaigns SET budget_reserved_cents = -1 WHERE id = $1`, [id])).toBe(CHECK);
      expect(await failsWith(`UPDATE campaigns SET uses_reserved = 2, uses_confirmed = 2 WHERE id = $1`, [id])).toBe(CHECK);
      expect(await failsWith(`UPDATE campaigns SET budget_reserved_cents = 6000, budget_spent_cents = 4000, uses_reserved = 1, uses_confirmed = 2 WHERE id = $1`, [id])).toBe('ok');
      expect(await failsWith(`INSERT INTO campaign_budget_days (campaign_id, day, limit_cents, reserved_cents, spent_cents) VALUES ($1, current_date, 5000, 3000, 2001)`, [id])).toBe(CHECK);
      expect(await failsWith(`INSERT INTO campaign_store_months (campaign_id, store_id, month, limit_cents, reserved_cents) VALUES ($1, $2, date_trunc('month', current_date), 15000, 15001)`, [id, storeId])).toBe(CHECK);
    });
  });

  it('o código de campanha privada é gerado e tem 8 ou mais caracteres (C-CUP-06)', async () => {
    await inTx(async () => {
      const base = `INSERT INTO coupons (code, kind, scope, value, starts_at, ends_at, visibility, code_origin) VALUES ($1, 'fixed', 'platform', 800, now(), now() + interval '1 day', $2, $3)`;
      expect(await failsWith(base, ['VAIDADE5', 'private', 'manual'])).toBe(CHECK);
      expect(await failsWith(base, ['ABC12', 'private', 'generated'])).toBe(CHECK);
      expect(await failsWith(base, ['K7Q2M9XB', 'private', 'generated'])).toBe('ok');
      expect(await failsWith(base, ['PROMO8', 'public', 'manual'])).toBe('ok');
    });
  });
});

describe('R2.1: reserva atômica e devolução única (C-CUP-02, C-CUP-03)', () => {
  /** SQL de referência da reserva (ADR-019 D4): trava a campanha, abre a linha do dia e faz os UPDATE guardados. `false` = esgotado (nada gravado). */
  async function reserve(c: pg.PoolClient, campaignId: string, cents: number, dailyLimit: number): Promise<boolean> {
    await c.query('BEGIN');
    try {
      const locked = await c.query(`SELECT 1 FROM campaigns WHERE id = $1 AND state = 'active' FOR UPDATE`, [campaignId]);
      if (locked.rowCount !== 1) throw new Error('inactive');
      await c.query(`INSERT INTO campaign_budget_days (campaign_id, day, limit_cents) VALUES ($1, (now() AT TIME ZONE 'America/Sao_Paulo')::date, $2) ON CONFLICT DO NOTHING`, [campaignId, dailyLimit]);
      const day = await c.query(`UPDATE campaign_budget_days SET reserved_cents = reserved_cents + $2 WHERE campaign_id = $1 AND day = (now() AT TIME ZONE 'America/Sao_Paulo')::date AND reserved_cents + spent_cents + $2 <= limit_cents`, [campaignId, cents]);
      const total = await c.query(`UPDATE campaigns SET budget_reserved_cents = budget_reserved_cents + $2 WHERE id = $1 AND budget_reserved_cents + budget_spent_cents + $2 <= budget_total_cents`, [campaignId, cents]);
      if (day.rowCount !== 1 || total.rowCount !== 1) {
        await c.query('ROLLBACK');
        return false;
      }
      await c.query('COMMIT');
      return true;
    } catch (error) {
      await c.query('ROLLBACK');
      if ((error as Error).message === 'inactive') return false;
      throw error;
    }
  }

  async function race(totalCents: number, dailyCents: number): Promise<{ won: number; reserved: number; violations: number }> {
    const id = await newCampaign({ budget_total_cents: String(totalCents), budget_daily_cents: String(dailyCents) });
    const pool = new pg.Pool({ connectionString: URL, max: 20 });
    try {
      const results = await Promise.all(
        Array.from({ length: 20 }, async () => {
          const c = await pool.connect();
          try {
            return await reserve(c, id, 800, dailyCents);
          } finally {
            c.release();
          }
        }),
      );
      const row = (await client.query<{ reserved: number }>(`SELECT budget_reserved_cents AS reserved FROM campaigns WHERE id = $1`, [id])).rows[0]!;
      const dayRow = (await client.query<{ reserved: number }>(`SELECT reserved_cents AS reserved FROM campaign_budget_days WHERE campaign_id = $1`, [id])).rows[0]!;
      expect(dayRow.reserved).toBe(row.reserved);
      await client.query(`DELETE FROM campaign_budget_days WHERE campaign_id = $1`, [id]);
      await client.query(`DELETE FROM campaigns WHERE id = $1`, [id]);
      return { won: results.filter(Boolean).length, reserved: row.reserved, violations: 0 };
    } finally {
      await pool.end();
    }
  }

  it('20 pedidos simultâneos de R$ 8,00 contra os últimos R$ 40,00 do total: no máximo 5 reservam, e a soma é R$ 40,00', async () => {
    const r = await race(4000, 100000);
    expect(r.won).toBe(5);
    expect(r.reserved).toBe(4000);
  });

  it('20 pedidos simultâneos contra o limite DO DIA (R$ 40,00 de R$ 1.000,00 no total): o dia é o teto', async () => {
    const r = await race(100000, 4000);
    expect(r.won).toBe(5);
    expect(r.reserved).toBe(4000);
  });

  it('expirar e cancelar o mesmo pedido em paralelo devolve UMA vez (transição condicional)', async () => {
    const campaign = await newCampaign();
    const orderId = randomUUID();
    await client.query(`INSERT INTO coupon_reservations (order_id, campaign_id, user_id, store_id, webag_cents, store_cents, day, month) VALUES ($1, $2, $3, $4, 800, 0, current_date, date_trunc('month', current_date))`, [orderId, campaign, userId, storeId]);
    const pool = new pg.Pool({ connectionString: URL, max: 4 });
    try {
      const giveBack = (reason: string) => pool.query(`UPDATE coupon_reservations SET state = 'returned', returned_at = now(), returned_reason = $2 WHERE order_id = $1 AND state = 'reserved'`, [orderId, reason]);
      const results = await Promise.all([giveBack('expired'), giveBack('cancelled'), giveBack('cancelled'), giveBack('expired')]);
      expect(results.reduce((n, r) => n + (r.rowCount ?? 0), 0)).toBe(1); // exatamente uma devolveu
      // confirmar depois de devolvido não faz nada (0 linhas), e devolver o que já voltou também não
      expect((await pool.query(`UPDATE coupon_reservations SET state = 'confirmed', confirmed_at = now() WHERE order_id = $1 AND state = 'reserved'`, [orderId])).rowCount).toBe(0);
    } finally {
      await pool.end();
      await client.query(`DELETE FROM coupon_reservations WHERE order_id = $1`, [orderId]);
      await client.query(`DELETE FROM campaigns WHERE id = $1`, [campaign]);
    }
  });

  it('a reserva tem forma coerente com o estado e o estorno parcial nunca passa do confirmado', async () => {
    await inTx(async () => {
      const campaign = await newCampaign();
      const ins = (cols: string, vals: string) => `INSERT INTO coupon_reservations (order_id, campaign_id, user_id, store_id, webag_cents, store_cents, day, month, ${cols}) VALUES (gen_random_uuid(), '${campaign}', '${userId}', '${storeId}', 800, 0, current_date, date_trunc('month', current_date), ${vals})`;
      expect(await failsWith(ins('state, confirmed_at', `'reserved', now()`))).toBe(CHECK);
      expect(await failsWith(ins('state', `'confirmed'`))).toBe(CHECK); // confirmada sem hora
      expect(await failsWith(ins('state, returned_at', `'returned', now()`))).toBe(CHECK); // devolvida sem motivo
      expect(await failsWith(ins('state, confirmed_at, refunded_webag_cents', `'confirmed', now(), 801`))).toBe(CHECK); // devolveu mais que o confirmado
      expect(await failsWith(ins('state, confirmed_at, refunded_webag_cents', `'confirmed', now(), 400`))).toBe('ok'); // estorno parcial
      expect(await failsWith(`INSERT INTO coupon_reservations (order_id, campaign_id, user_id, store_id, webag_cents, store_cents, day, month) VALUES (gen_random_uuid(), '${campaign}', '${userId}', '${storeId}', 0, 0, current_date, date_trunc('month', current_date))`)).toBe(CHECK); // desconto zero não reserva
    });
  });
});

describe('R2.1: diário do orçamento append-only e invariante (ledger da campanha)', () => {
  const entry = (campaign: string, kind: string, cents: number, key: string, funder = 'webag') =>
    client.query(`INSERT INTO campaign_budget_entries (campaign_id, kind, funder, amount_cents, day, month, dedupe_key, store_id) VALUES ($1, $2, $3, $4, current_date, date_trunc('month', current_date), $5, $6)`, [campaign, kind, funder, cents, key, storeId]);

  it('UPDATE, DELETE e TRUNCATE são negados em QUALQUER papel (gatilho), no diário e na prova de aceite', async () => {
    await inTx(async () => {
      const campaign = await newCampaign();
      await entry(campaign, 'reserve', 800, `t:${randomUUID()}`);
      await client.query(`INSERT INTO campaign_acceptances (campaign_id, store_id, user_id, action, store_share_pct, terms_version, terms_hash, monthly_cap_cents) VALUES ($1, $2, $3, 'accept', 40, 'v1', $4, 15000)`, [campaign, storeId, userId, hex('a')]);
      for (const table of ['campaign_budget_entries', 'campaign_acceptances']) {
        expect(await failsWith(`UPDATE ${table} SET id = id WHERE false`), `${table} update`).toBe('ok'); // 0 linhas: o gatilho é por LINHA
        expect(await failsWith(`UPDATE ${table} SET ${table === 'campaign_acceptances' ? 'store_share_pct = 0' : 'amount_cents = 1'}`), `${table} update`).toBe(RESTRICT);
        expect(await failsWith(`DELETE FROM ${table}`), `${table} delete`).toBe(RESTRICT);
        expect(await failsWith(`TRUNCATE ${table} CASCADE`), `${table} truncate`).toBe(RESTRICT);
      }
    });
  });

  it('a mesma chave de deduplicação não lança duas vezes (repetir o job não duplica) e o valor é positivo', async () => {
    await inTx(async () => {
      const campaign = await newCampaign();
      const key = `res:${randomUUID()}:reserve`;
      await entry(campaign, 'reserve', 800, key);
      expect(await failsWith(`INSERT INTO campaign_budget_entries (campaign_id, kind, funder, amount_cents, day, month, dedupe_key) VALUES ($1, 'reserve', 'webag', 800, current_date, date_trunc('month', current_date), $2)`, [campaign, key])).toBe(UNIQUE);
      expect(await failsWith(`INSERT INTO campaign_budget_entries (campaign_id, kind, funder, amount_cents, day, month, dedupe_key) VALUES ($1, 'reserve', 'webag', 0, current_date, date_trunc('month', current_date), 'zero')`, [campaign])).toBe(CHECK);
    });
  });

  /** Reserva `confirmed` com estorno parcial (o que o diário abaixo conta) e a devolvida; a invariante agora também cruza as reservas com os contadores (SEC-229). */
  const reservation = (campaign: string, over: Record<string, string> = {}) => {
    const row: Record<string, string> = { order_id: 'gen_random_uuid()', campaign_id: `'${campaign}'`, user_id: `'${userId}'`, store_id: `'${storeId}'`, webag_cents: '800', store_cents: '0', day: 'current_date', month: `date_trunc('month', current_date)`, ...over };
    return client.query(`INSERT INTO coupon_reservations (${Object.keys(row).join(', ')}) VALUES (${Object.values(row).join(', ')})`);
  };
  const violations = (campaign: string) => client.query<{ counter: string; expected: string; actual: string; scope: string }>(`SELECT scope, counter, expected, actual FROM campaign_budget_violations() WHERE campaign_id = $1 ORDER BY counter, scope`, [campaign]).then((r) => r.rows);

  it('`campaign_budget_violations()` fica vazia quando os contadores batem com o diário e as reservas, e acusa o contador adulterado', async () => {
    await inTx(async () => {
      const campaign = await newCampaign();
      // reserva 800, confirma 800, nova reserva 800 e devolve; estorno parcial de 300 do confirmado: reservado 0, gasto 500
      await entry(campaign, 'reserve', 800, 'a1');
      await entry(campaign, 'confirm', 800, 'a2');
      await entry(campaign, 'reserve', 800, 'a3');
      await entry(campaign, 'release', 800, 'a4');
      await entry(campaign, 'refund', 300, 'a5');
      await reservation(campaign, { state: `'confirmed'`, confirmed_at: 'now()', refunded_webag_cents: '300' });
      await reservation(campaign, { state: `'returned'`, returned_at: 'now()', returned_reason: `'expired'` });
      await client.query(`UPDATE campaigns SET budget_reserved_cents = 0, budget_spent_cents = 500, uses_confirmed = 1 WHERE id = $1`, [campaign]);
      await client.query(`INSERT INTO campaign_budget_days (campaign_id, day, limit_cents, reserved_cents, spent_cents) VALUES ($1, current_date, 5000, 0, 500)`, [campaign]);
      expect(await violations(campaign)).toEqual([]);
      await client.query(`UPDATE campaigns SET budget_spent_cents = 600 WHERE id = $1`, [campaign]); // alguém mexeu no contador
      expect((await violations(campaign)).map((r) => `${r.counter}:${r.expected}:${r.actual}`)).toEqual(['budget_spent_cents:500:600', 'reservations_webag_spent:500:600']);
      await client.query(`UPDATE campaigns SET budget_spent_cents = 500 WHERE id = $1`, [campaign]);
      await client.query(`UPDATE campaign_budget_days SET reserved_cents = 100 WHERE campaign_id = $1`, [campaign]);
      expect((await violations(campaign)).map((r) => r.counter)).toEqual(['reserved_cents']);
    });
  });

  it('R1: o invariante enxerga entrada de diário SEM linha de contador (dia e loja-mês), esperado x real com ausente = 0', async () => {
    await inTx(async () => {
      const campaign = await newCampaign();
      await entry(campaign, 'reserve', 800, 'r1-day');
      await client.query(`UPDATE campaigns SET budget_reserved_cents = 800 WHERE id = $1`, [campaign]); // o contador da campanha existe; a linha do DIA não (o serviço esqueceu)
      await reservation(campaign);
      await client.query(`UPDATE campaigns SET uses_reserved = 1 WHERE id = $1`, [campaign]);
      expect((await violations(campaign)).map((r) => `${r.scope.startsWith('day:') ? 'day' : r.scope}:${r.counter}:${r.expected}:${r.actual}`)).toEqual(['day:reserved_cents:800:0']);
      const store = await newCampaign({ funding_source: `'store'`, store_share_pct: '100', budget_total_cents: 'null', budget_daily_cents: 'null', max_uses: '10' });
      await entry(store, 'reserve', 500, 'r1-month', 'store');
      await reservation(store, { webag_cents: '0', store_cents: '500' });
      await client.query(`UPDATE campaigns SET uses_reserved = 1 WHERE id = $1`, [store]);
      expect((await violations(store)).map((r) => `${r.scope.startsWith('store_month:') ? 'month' : r.scope}:${r.counter}:${r.expected}:${r.actual}`)).toEqual(['campaign:reservations_store_reserved:500:0', 'month:reserved_cents:500:0']);
    });
  });

  it('SEC-229: campanha "Loja paga" não aceita gasto da Webag, entrada de loja exige a loja, e o mês é o do dia', async () => {
    await inTx(async () => {
      const store = await newCampaign({ funding_source: `'store'`, store_share_pct: '100', budget_total_cents: 'null', budget_daily_cents: 'null', max_uses: '10' });
      expect(await failsWith(`UPDATE campaigns SET budget_reserved_cents = 800 WHERE id = $1`, [store])).toBe(CHECK);
      expect(await failsWith(`UPDATE campaigns SET budget_spent_cents = 800 WHERE id = $1`, [store])).toBe(CHECK);
      const ins = (store_id: string, month: string) => `INSERT INTO campaign_budget_entries (campaign_id, kind, funder, amount_cents, day, month, dedupe_key, store_id) VALUES ('${store}', 'reserve', 'store', 100, current_date, ${month}, '${randomUUID()}', ${store_id})`;
      expect(await failsWith(ins('null', `date_trunc('month', current_date)`))).toBe(CHECK);
      expect(await failsWith(ins(`'${storeId}'`, `current_date + 40`))).toBe(CHECK); // mês de outro dia
      expect(await failsWith(ins(`'${storeId}'`, `date_trunc('month', current_date)`))).toBe('ok');
      expect(await failsWith(`INSERT INTO campaign_store_months (campaign_id, store_id, month, limit_cents) VALUES ('${store}', '${storeId}', (date_trunc('month', current_date) + interval '1 day')::date, 1000)`)).toBe(CHECK); // o mês da loja é sempre o dia 1
    });
  });

  it('R4: `orders` tem índice em `updated_at` e em `paid_at` (o job de agregação não varre a tabela)', async () => {
    const { rows } = await client.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE tablename = 'orders' AND indexname IN ('orders_updated_idx', 'orders_paid_idx')`);
    expect(rows.map((r) => r.indexname).sort()).toEqual(['orders_paid_idx', 'orders_updated_idx']);
  });
});

describe('R2.1: antifraude por HMAC (C-CUP-04, C-CUP-05)', () => {
  it('a primeira compra é consumida uma vez por identificador, valendo ENTRE campanhas; liberar (pedido não pago) libera o identificador', async () => {
    await inTx(async () => {
      const a = await newCampaign({ audience: `'first_purchase'` });
      const b = await newCampaign({ audience: `'first_purchase'` });
      const claim = (campaign: string, kind: string, mac: string) =>
        client.query(`INSERT INTO coupon_fraud_claims (kind, hmac, order_id, campaign_id) VALUES ($1, $2, gen_random_uuid(), $3)`, [kind, mac, campaign]);
      await claim(a, 'device', hex('d'));
      expect(await failsWith(`INSERT INTO coupon_fraud_claims (kind, hmac, order_id, campaign_id) VALUES ('device', $1, gen_random_uuid(), $2)`, [hex('d'), b])).toBe(UNIQUE); // outra campanha, mesmo aparelho
      await claim(b, 'address', hex('d')); // o mesmo HMAC em OUTRO tipo de identificador não colide
      await client.query(`UPDATE coupon_fraud_claims SET state = 'released', released_at = now() WHERE kind = 'device' AND hmac = $1`, [hex('d')]);
      expect(await failsWith(`INSERT INTO coupon_fraud_claims (kind, hmac, order_id, campaign_id) VALUES ('device', $1, gen_random_uuid(), $2)`, [hex('d'), b])).toBe('ok');
    });
  });

  it('o limite de usos por cliente da campanha (mesmo aparelho) é outro escopo: vários por identificador entre campanhas, contado sob a trava da campanha', async () => {
    await inTx(async () => {
      const a = await newCampaign();
      const b = await newCampaign();
      const use = (campaign: string, mac: string) => client.query(`INSERT INTO coupon_fraud_claims (scope, kind, hmac, order_id, campaign_id) VALUES ('campaign_use', 'device', $1, gen_random_uuid(), $2)`, [mac, campaign]);
      await use(a, hex('9'));
      await use(b, hex('9')); // outra campanha, mesmo aparelho: permitido (a primeira compra é que é única entre campanhas)
      expect(await failsWith(`INSERT INTO coupon_fraud_claims (scope, kind, hmac, order_id, campaign_id) VALUES ('first_purchase', 'device', $1, gen_random_uuid(), $2)`, [hex('9'), a])).toBe('ok'); // escopo distinto
      expect(await failsWith(`INSERT INTO coupon_fraud_claims (scope, kind, hmac, order_id, campaign_id) VALUES ('first_purchase', 'device', $1, gen_random_uuid(), $2)`, [hex('9'), b])).toBe(UNIQUE);
      expect(await failsWith(`INSERT INTO coupon_fraud_claims (scope, kind, hmac, order_id, campaign_id) VALUES ('outro', 'device', $1, gen_random_uuid(), $2)`, [hex('8'), a])).toBe(CHECK);
    });
  });

  it('só entra HMAC (64 hexadecimais): CPF, endereço, id de aparelho ou telefone em claro são recusados pelo banco', async () => {
    await inTx(async () => {
      const campaign = await newCampaign();
      for (const raw of ['12345678909', 'Rua das Flores 10 apto 1', '8f2c-aparelho-id', '11987654321']) {
        expect(await failsWith(`INSERT INTO coupon_fraud_claims (kind, hmac, order_id, campaign_id) VALUES ('document', $1, gen_random_uuid(), $2)`, [raw, campaign]), raw).toBe(CHECK);
        expect(await failsWith(`INSERT INTO coupon_identifier_sightings (kind, hmac, account_hmac) VALUES ('device', $1, $2)`, [raw, hex('a')]), raw).toBe(CHECK);
      }
      expect(await failsWith(`INSERT INTO coupon_identifier_sightings (kind, hmac, account_hmac) VALUES ('device', $1, $2)`, [hex('b'), hex('c')])).toBe('ok');
      expect(await failsWith(`INSERT INTO coupon_identifier_sightings (kind, hmac, account_hmac) VALUES ('device', $1, $2)`, [hex('b'), hex('c')])).toBe(UNIQUE); // uma linha por (identificador, conta distinta)
      expect(await failsWith(`INSERT INTO coupon_identifier_sightings (kind, hmac, account_hmac) VALUES ('phone', $1, $2)`, [hex('e'), hex('f')])).not.toBe('ok'); // o celular não é identificador (DEC-103 D-01)
    });
  });

  it('"Suspeitos" guarda só o pedido e o sinal; liberar exige quem, quando e o motivo', async () => {
    await inTx(async () => {
      const campaign = await newCampaign();
      const order = randomUUID();
      await client.query(`INSERT INTO coupon_fraud_signals (user_id, order_id, campaign_id, signal) VALUES ($1, $2, $3, 'device_accounts')`, [userId, order, campaign]);
      expect(await failsWith(`INSERT INTO coupon_fraud_signals (user_id, order_id, campaign_id, signal) VALUES ($1, $2, $3, 'device_accounts')`, [userId, order, campaign])).toBe(UNIQUE);
      expect(await failsWith(`UPDATE coupon_fraud_signals SET state = 'released' WHERE order_id = $1`, [order])).toBe(CHECK); // sem autor nem motivo
      expect(await failsWith(`UPDATE coupon_fraud_signals SET state = 'released', released_by = $2, released_at = now(), release_reason = 'cliente legítimo' WHERE order_id = $1`, [order, userId])).toBe('ok');
      const columns = (await client.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_name = 'coupon_fraud_signals'`)).rows.map((r) => r.column_name);
      expect(columns.filter((c) => /hmac|device|document|cpf|phone|address|email/.test(c))).toEqual([]);
    });
  });
});

describe('R2.1: painéis, histórico de preço, código de barras e porta falsa', () => {
  it('o painel tem no máximo 12 widgets (posição 0 a 11 e única) e 2 dimensões; o pronto não tem dono e o do usuário sim', async () => {
    await inTx(async () => {
      const dash = (await client.query<{ id: string }>(`INSERT INTO dashboards (kind, owner_admin_id, name) VALUES ('user', $1, 'Quinzena') RETURNING id`, [userId])).rows[0]!.id;
      const widget = (position: number, dims = `'{}'`) => `INSERT INTO dashboard_widgets (dashboard_id, position, title, metric_id, dimension_ids, chart_type, period) VALUES ('${dash}', ${position}, 'GMV', 'gmv', ${dims}, 'bar', '{}')`;
      for (let i = 0; i < 12; i += 1) await client.query(widget(i));
      expect(await failsWith(widget(12))).toBe(CHECK); // a 13ª widget
      expect(await failsWith(widget(3))).toBe(UNIQUE);
      await client.query(`DELETE FROM dashboard_widgets WHERE dashboard_id = $1 AND position = 11`, [dash]);
      expect(await failsWith(widget(11, `'{store,city,category}'`))).toBe(CHECK); // 3 dimensões
      expect(await failsWith(`INSERT INTO dashboards (kind, owner_admin_id, name) VALUES ('preset', $1, 'Visão geral')`, [userId])).toBe(CHECK);
      expect(await failsWith(`INSERT INTO dashboards (kind, preset_key, name) VALUES ('preset', 'overview', 'Visão geral')`)).toBe('ok');
      expect(await failsWith(`INSERT INTO dashboards (kind, preset_key, name) VALUES ('preset', 'overview', 'Visão geral 2')`)).toBe(UNIQUE);
      expect(await failsWith(`INSERT INTO dashboards (kind, owner_admin_id, name) VALUES ('user', $1, $2)`, [userId, 'x'.repeat(81)])).not.toBe('ok');
    });
  });

  it('as tabelas de fato não têm coluna de cliente, motoboy, endereço nem bairro (C-DSH-04)', async () => {
    const { rows } = await client.query<{ table_name: string; column_name: string }>(`SELECT table_name, column_name FROM information_schema.columns WHERE table_name LIKE 'dashboard\\_%'`);
    expect(rows.length).toBeGreaterThan(30);
    const idsAllowed = new Set(['city_id', 'store_id', 'category_id', 'campaign_id', 'item_category_id', 'dashboard_id', 'metric_id']); // os dois últimos são do painel (a chave do painel e o id da métrica), não de pessoa
    expect(rows.filter((r) => /(^|_)(user|client|motoboy|address|street|neighborhood|bairro|cep|phone|email|cpf|device)(_|$)/.test(r.column_name) || (/_id$/.test(r.column_name) && !idsAllowed.has(r.column_name)))).toEqual([]);
  });

  it('o histórico de preço tem UM intervalo aberto por produto, variação e tipo; a variação nula conta como o preço base', async () => {
    await inTx(async () => {
      const product = (await client.query<{ id: string }>(`INSERT INTO products (store_id, name, status, base_price_cents) VALUES ($1, 'Produto R2', 'active', 5000) RETURNING id`, [storeId])).rows[0]!.id;
      const open = (kind: string, cents = 5000) => `INSERT INTO product_price_history (product_id, kind, price_cents, actor_kind) VALUES ('${product}', '${kind}', ${cents}, 'merchant')`;
      expect(await failsWith(open('base'))).toBe('ok');
      expect(await failsWith(open('base', 4500))).toBe(UNIQUE); // 2º intervalo aberto do mesmo tipo
      expect(await failsWith(open('promo', 4000))).toBe('ok');
      await client.query(`UPDATE product_price_history SET ended_at = now() WHERE product_id = $1 AND kind = 'base'`, [product]);
      expect(await failsWith(open('base', 4500))).toBe('ok'); // fechado o anterior, abre o novo
      expect(await failsWith(open('base', 0).replace('4500', '0'))).not.toBe('ok');
      expect(await failsWith(`UPDATE product_price_history SET ended_at = started_at - interval '1 day' WHERE product_id = $1 AND kind = 'promo'`, [product])).toBe(CHECK);
    });
  });

  it('o código de barras é único por loja, só com 8 ou 12 a 14 dígitos; o catálogo de referência segue o mesmo formato', async () => {
    await inTx(async () => {
      const product = (await client.query<{ id: string }>(`INSERT INTO products (store_id, name, status) VALUES ($1, 'Produto EAN', 'draft') RETURNING id`, [storeId])).rows[0]!.id;
      const ins = (code: string) => client.query(`INSERT INTO product_barcodes (store_id, barcode, product_id) VALUES ($1, $2, $3)`, [storeId, code, product]);
      await ins('7891000100103');
      expect(await failsWith(`INSERT INTO product_barcodes (store_id, barcode, product_id) VALUES ($1, '7891000100103', $2)`, [storeId, product])).toBe(UNIQUE);
      for (const bad of ['123', '12345678901', 'ABC45678', '789100010010x']) expect(await failsWith(`INSERT INTO product_barcodes (store_id, barcode, product_id) VALUES ($1, $2, $3)`, [storeId, bad, product]), bad).toBe(CHECK);
      expect(await failsWith(`INSERT INTO product_barcodes (store_id, barcode, product_id) VALUES ($1, '123456789012345', $2)`, [storeId, product])).not.toBe('ok'); // 15 dígitos
      expect(await failsWith(`INSERT INTO reference_barcodes (barcode, name, source) VALUES ('7891000100103', 'Sabonete', 'admin')`)).toBe('ok');
      expect(await failsWith(`INSERT INTO reference_barcodes (barcode, name, source) VALUES ('12', 'Inválido', 'admin')`)).toBe(CHECK);
    });
  });

  it('a porta falsa é um LOG por loja: o toque não leva faixa nem texto, a resposta leva a faixa de exemplo e o texto de até 200 caracteres', async () => {
    await inTx(async () => {
      const ins = (kind: string, band: string | null, note: string | null) => client.query(`INSERT INTO analytics_interest_events (store_id, user_id, kind, price_band, note) VALUES ($1, $2, $3, $4, $5)`, [storeId, userId, kind, band, note]);
      await ins('clicked', null, null);
      await ins('answered', '20_to_39', 'depende do que vier');
      await ins('answered', 'would_not_pay', null); // mudou de ideia: a última vale, as anteriores ficam
      const sql = `INSERT INTO analytics_interest_events (store_id, user_id, kind, price_band, note) VALUES ('${storeId}', '${userId}', $1, $2, $3)`;
      expect(await failsWith(sql, ['clicked', '20_to_39', null])).toBe(CHECK); // toque com faixa
      expect(await failsWith(sql, ['clicked', null, 'texto'])).toBe(CHECK); // toque com texto
      expect(await failsWith(sql, ['answered', null, null])).toBe(CHECK); // resposta sem faixa
      expect(await failsWith(sql, ['answered', 'R$ 25', null])).toBe(CHECK); // só as 5 faixas de exemplo
      expect(await failsWith(sql, ['answered', '80_plus', 'x'.repeat(201)])).not.toBe('ok');
      const latest = await client.query<{ price_band: string }>(`SELECT DISTINCT ON (store_id) price_band FROM analytics_interest_events WHERE store_id = $1 AND kind = 'answered' ORDER BY store_id, created_at DESC, id DESC`, [storeId]);
      expect(latest.rows[0]!.price_band).toBe('would_not_pay');
    });
  });
});

describe('R2.1 (correções da revisão): visibilidade, posse do convite e histórico de preço', () => {
  it('R2: `visibility` e `code_origin` só aceitam os valores do enum (o que esconde o código privado também é CHECK)', async () => {
    await inTx(async () => {
      const base = (visibility: string, origin: string, code: string) => `INSERT INTO coupons (code, kind, scope, value, starts_at, ends_at, visibility, code_origin) VALUES ('${code}', 'fixed', 'platform', 800, now(), now() + interval '1 day', '${visibility}', '${origin}')`;
      expect(await failsWith(base('zzz', 'generated', 'ABCDEFGHIJ'))).toBe(CHECK);
      expect(await failsWith(base('public', 'zzz', 'ABCDEFGHIK'))).toBe(CHECK);
      expect(await failsWith(base('private', 'generated', 'ABCDEFGHIL'))).toBe('ok');
    });
  });

  it('SEC-227: o aceite de uma loja não pode citar o convite de OUTRA loja nem de outra campanha (FK composta)', async () => {
    await inTx(async () => {
      const otherOwner = (await client.query<{ id: string }>(`INSERT INTO users (email, name) VALUES ($1, 'R2 outra loja') RETURNING id`, [`r2-other-${randomUUID()}@example.invalid`])).rows[0]!.id;
      const other = (await client.query<{ id: string }>(`INSERT INTO stores (owner_user_id, document_type, document_number) VALUES ($1, 'cpf', '11111111111') RETURNING id`, [otherOwner])).rows[0]!.id;
      const campaign = await newCampaign({ funding_source: `'split'`, store_share_pct: '40', kind: `'percent'`, value: '10', percent_cap_cents: '500' });
      const otherCampaign = await newCampaign({ funding_source: `'split'`, store_share_pct: '40', kind: `'percent'`, value: '10', percent_cap_cents: '500' });
      const enrollment = (await client.query<{ id: string }>(`INSERT INTO campaign_store_enrollments (campaign_id, store_id, expires_at) VALUES ($1, $2, now() + interval '7 days') RETURNING id`, [campaign, other])).rows[0]!.id;
      const accept = (store: string, camp: string) =>
        `INSERT INTO campaign_acceptances (campaign_id, store_id, enrollment_id, user_id, action, store_share_pct, terms_version, terms_hash, monthly_cap_cents) VALUES ('${camp}', '${store}', '${enrollment}', '${userId}', 'accept', 40, 'v1', '${hex('a')}', 15000)`;
      expect(await failsWith(accept(storeId, campaign))).toBe('23503'); // loja A com o convite da loja B
      expect(await failsWith(accept(other, otherCampaign))).toBe('23503'); // a loja certa, mas outra campanha
      expect(await failsWith(accept(other, campaign))).toBe('ok');
    });
  });

  it('SEC-230: o histórico de preço só aceita fechar o intervalo; o papel da API não apaga reservas nem histórico', async () => {
    await inTx(async () => {
      const product = (await client.query<{ id: string }>(`INSERT INTO products (store_id, name, status, base_price_cents) VALUES ($1, 'Produto SEC-230', 'active', 5000) RETURNING id`, [storeId])).rows[0]!.id;
      await client.query(`INSERT INTO product_price_history (product_id, kind, price_cents, actor_kind) VALUES ($1, 'base', 5000, 'merchant')`, [product]);
      expect(await failsWith(`UPDATE product_price_history SET started_at = started_at - interval '40 days' WHERE product_id = $1`, [product])).toBe(RESTRICT); // "comprovar" 30 dias
      expect(await failsWith(`UPDATE product_price_history SET price_cents = 1 WHERE product_id = $1`, [product])).toBe(RESTRICT);
      expect(await failsWith(`UPDATE product_price_history SET ended_at = now() WHERE product_id = $1`, [product])).toBe('ok');
      expect(await failsWith(`UPDATE product_price_history SET ended_at = now() + interval '1 day' WHERE product_id = $1`, [product])).toBe(RESTRICT); // já fechado: não reabre nem muda
    });
  });
});
