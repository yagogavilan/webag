import { Injectable } from '@nestjs/common';

export interface DeliveryQuoteSummary {
  available: boolean;
  distanceM: number | null;
  feeCents: number | null;
  freeShipping: boolean;
  belowMinimum: boolean;
}

export type DeliveryQuoter = (storeId: string, point: { lat: number; lng: number }, subtotalCents: number) => Promise<DeliveryQuoteSummary>;

/**
 * A taxa de entrega é da Webag (DEC-036): quem a calcula é o módulo de logística, que se registra aqui. Evita o ciclo
 * stores -> logistics -> stores (mesmo padrão do `SellerCredentialsRegistry` nos pagamentos).
 */
@Injectable()
export class DeliveryQuoteRegistry {
  private quoter: DeliveryQuoter | null = null;

  register(quoter: DeliveryQuoter): void {
    this.quoter = quoter;
  }

  async quote(storeId: string, point: { lat: number; lng: number }, subtotalCents: number): Promise<DeliveryQuoteSummary> {
    if (!this.quoter) return { available: false, distanceM: null, feeCents: null, freeShipping: false, belowMinimum: false };
    return this.quoter(storeId, point, subtotalCents);
  }
}
