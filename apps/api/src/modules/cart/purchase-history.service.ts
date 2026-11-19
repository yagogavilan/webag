import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { PurchaseHistoryPort, type PurchaseAddressHint } from './cart.service.js';

const digits = (value: string | null | undefined): string => (value ?? '').replace(/\D/g, '');
const norm = (value: string | null | undefined): string => (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * SEC-155 / SEC-060 (mínimo do MVP): conferido NO SERVIDOR. Pedido "pago" = `paid_at` preenchido e fora de cancelado, recusado
 * ou expirado (esses foram estornados). Além da própria conta, bloqueia a mesma pessoa em outra conta: mesmo telefone, mesmo
 * aparelho (`sessions.device_id`) ou mesmo endereço (CEP + número + complemento). O documento do pagador entra quando o
 * provedor devolver. Leitura direta e só de leitura em `orders`/`users`/`sessions` (mesmo padrão do catálogo).
 */
@Injectable()
export class PaidPurchaseHistory extends PurchaseHistoryPort {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {
    super();
  }

  async hasPaidOrder(userId: string, hints: { address?: PurchaseAddressHint | null } = {}): Promise<boolean> {
    const address = hints.address;
    const cep = digits(address?.cep);
    const number = norm(address?.number);
    const complement = norm(address?.complement);
    const result = await this.db.execute<{ found: boolean }>(sql`
      with paid as (
        select o.user_id, o.address from orders o
         where o.paid_at is not null and o.status not in ('cancelled', 'refused', 'expired')
      )
      select (
        exists (select 1 from paid where paid.user_id = ${userId}::uuid)
        or exists (
          select 1 from paid join users u on u.id = paid.user_id join users me on me.id = ${userId}::uuid
           where paid.user_id <> me.id and length(regexp_replace(coalesce(me.phone, ''), '\\D', '', 'g')) >= 10
             and regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g') = regexp_replace(me.phone, '\\D', '', 'g')
        )
        or exists (
          select 1 from paid
            join sessions s2 on s2.user_id = paid.user_id and s2.device_id is not null
            join sessions s1 on s1.user_id = ${userId}::uuid and s1.device_id = s2.device_id
           where paid.user_id <> ${userId}::uuid
        )
        or (${cep}::text <> '' and ${number}::text <> '' and exists (
          select 1 from paid
           where paid.user_id <> ${userId}::uuid
             and regexp_replace(coalesce(paid.address->>'cep', ''), '\\D', '', 'g') = ${cep}
             and regexp_replace(lower(coalesce(paid.address->>'number', '')), '[^a-z0-9]', '', 'g') = ${number}
             and regexp_replace(lower(coalesce(paid.address->>'complement', '')), '[^a-z0-9]', '', 'g') = ${complement}
        ))
      ) as found
    `);
    return result.rows[0]?.found === true;
  }
}
