import { sql } from 'drizzle-orm';
import { check, type AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * `text({ enum })` do Drizzle é só TypeScript: o banco aceitaria qualquer texto (DT-098). Para o que é DINHEIRO ou SEGURANÇA (fonte de custo do cupom, estado da reserva, tipo do
 * movimento do orçamento, tipo de identificador antifraude), o valor também é um CHECK, a 2ª camada: o `FIELD` inexistente ("cupom fake" como quinta fonte, DEC-088) é recusado
 * mesmo por um `INSERT` direto. Os valores vêm das constantes do próprio schema (nunca de entrada), por isso o `sql.raw` com literais escapados.
 */
export function enumCheck(name: string, column: AnyPgColumn, values: readonly string[]) {
  return check(name, sql`${column} in (${sql.raw(values.map((v) => `'${v.replaceAll("'", "''")}'`).join(', '))})`);
}
