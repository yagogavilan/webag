import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Regra 5 do modelo de dados (B4): toda migração a partir da 0058 leva um script de reversão em `drizzle/down/<NNNN>.sql` (fora da pasta que o migrator lê).
 * Este teste roda no CI (`pnpm test:unit`) e barra a migração nova sem o `down`. O teste e2e `migrations-down.e2e-spec.ts` prova que os scripts funcionam.
 * As anteriores (0000 a 0057) não têm `down` e não ganham: já estão aplicadas em todos os ambientes.
 */
const DRIZZLE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../drizzle');
export const FIRST_MIGRATION_WITH_DOWN = 58;

const journal = JSON.parse(readFileSync(path.join(DRIZZLE_DIR, 'meta/_journal.json'), 'utf8')) as { entries: { idx: number; when: number; tag: string }[] };
const required = journal.entries.filter((e) => e.idx >= FIRST_MIGRATION_WITH_DOWN);

describe('reversão das migrações (regra 5 do modelo de dados)', () => {
  it('há ao menos uma migração coberta pela regra (o filtro não esvaziou)', () => {
    expect(required.length).toBeGreaterThanOrEqual(4);
  });

  it.each(required.map((e) => [e.tag, e] as const))('%s tem drizzle/down/<NNNN>.sql que apaga o próprio registro do Drizzle', (_tag, entry) => {
    const file = path.join(DRIZZLE_DIR, 'down', `${entry.tag.slice(0, 4)}.sql`);
    expect(existsSync(file), `falta ${path.relative(DRIZZLE_DIR, file)}: toda migração nova leva um script de reversão`).toBe(true);
    const sql = readFileSync(file, 'utf8');
    // Sem apagar a linha do registro, o migrator acha a migração "já aplicada" e nunca a reaplica depois da reversão.
    expect(sql).toContain(`DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = ${entry.when};`);
    expect(sql).toMatch(/^-- /); // cabeçalho com o aviso do que a reversão apaga
  });

  it('não há script de reversão órfão (sem migração correspondente)', () => {
    const tags = new Set(required.map((e) => e.tag.slice(0, 4)));
    const orphans = readdirSync(path.join(DRIZZLE_DIR, 'down')).filter((f) => f.endsWith('.sql') && !tags.has(f.slice(0, 4)));
    expect(orphans).toEqual([]);
  });
});
