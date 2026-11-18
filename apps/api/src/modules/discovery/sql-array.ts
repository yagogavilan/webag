import { sql, type SQL } from 'drizzle-orm';

/**
 * Array do PostgreSQL como UM parâmetro (o drizzle expande array JS em vários `$n`). Só para uuid, número e booleano
 * (valores que não precisam de aspas nem escape); o literal vai como parâmetro, nunca concatenado no SQL.
 */
export const pgArray = (values: readonly (string | number | boolean)[], cast: 'uuid' | 'int' | 'float8' | 'boolean'): SQL => {
  for (const value of values) {
    if (typeof value === 'string' && !/^[0-9a-f-]{36}$/i.test(value)) throw new Error('pgArray aceita só uuid');
  }
  return sql`${`{${values.join(',')}}`}::${sql.raw(cast)}[]`;
};
