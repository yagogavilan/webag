import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import type { Env } from '../../platform/config/env.js';
import { hmacHex } from '../../platform/crypto/crypto.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { PurchaseHistoryPort, type PurchaseHints } from './cart.service.js';

const digits = (value: string | null | undefined): string => (value ?? '').replace(/\D/g, '');
const norm = (value: string | null | undefined): string => (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * SEC-155 / SEC-060 / SEC-170: conferido NO SERVIDOR. Pedido "pago" = `paid_at` preenchido e fora de cancelado, recusado ou
 * expirado (esses foram estornados). Além da própria conta, bloqueia a mesma pessoa em outra conta: mesmo telefone, mesmo
 * aparelho (`sessions.device_id`), mesmo endereço (CEP + número; o complemento é ignorado) ou mesmo documento do pagador.
 * Das OUTRAS contas conta também o pedido ainda não pago e não vencido que reservou um cupom de primeira compra (pedidos
 * simultâneos antes do pagamento). Leitura direta e só de leitura em `orders`/`users`/`sessions` (mesmo padrão do catálogo).
 */
@Injectable()
export class PaidPurchaseHistory extends PurchaseHistoryPort {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  documentHash(document: string): string {
    return hmacHex(this.config.get('AUTH_HMAC_KEY', { infer: true }), `payer-document:${digits(document)}`);
  }

  async hasPaidOrder(userId: string, hints: PurchaseHints = {}): Promise<boolean> {
    const address = hints.address;
    const cep = digits(address?.cep);
    const number = norm(address?.number);
    const documentHash = hints.documentHash ?? '';
    const result = await this.db.execute<{ found: boolean }>(sql`
      with taken as not materialized (
        select o.user_id, o.address, o.payer_document_hash, true as settled from orders o
         where o.paid_at is not null and o.status not in ('cancelled', 'refused', 'expired')
        union all
        select o.user_id, o.address, o.payer_document_hash, false as settled from orders o
         where o.status = 'awaiting_payment' and o.paid_at is null and o.payment_expires_at > now()
           and exists (
             select 1 from coupon_redemptions r join coupons c on c.id = r.coupon_id
              where r.order_id = o.id and r.released_at is null and c.first_purchase_only
           )
      )
      select (
        exists (select 1 from taken where taken.user_id = ${userId}::uuid and taken.settled)
        or exists (
          select 1 from taken join users u on u.id = taken.user_id join users me on me.id = ${userId}::uuid
           where taken.user_id <> me.id and length(regexp_replace(coalesce(me.phone, ''), '\\D', '', 'g')) >= 10
             and regexp_replace(coalesce(u.phone, ''), '\\D', '', 'g') = regexp_replace(me.phone, '\\D', '', 'g')
        )
        or exists (
          select 1 from taken
            join sessions s2 on s2.user_id = taken.user_id and s2.device_id is not null
            join sessions s1 on s1.user_id = ${userId}::uuid and s1.device_id = s2.device_id
           where taken.user_id <> ${userId}::uuid
        )
        or (${cep}::text <> '' and ${number}::text <> '' and exists (
          select 1 from taken
           where taken.user_id <> ${userId}::uuid
             and regexp_replace(coalesce(taken.address->>'cep', ''), '\\D', '', 'g') = ${cep}
             and regexp_replace(lower(coalesce(taken.address->>'number', '')), '[^a-z0-9]', '', 'g') = ${number}
        ))
        or (${documentHash}::text <> '' and exists (
          select 1 from taken where taken.user_id <> ${userId}::uuid and taken.payer_document_hash = ${documentHash}
        ))
        or exists (
          select 1 from taken join orders mine on mine.user_id = ${userId}::uuid and mine.payer_document_hash is not null
           where taken.user_id <> ${userId}::uuid and taken.payer_document_hash = mine.payer_document_hash
        )
      ) as found
    `);
    return result.rows[0]?.found === true;
  }
}
