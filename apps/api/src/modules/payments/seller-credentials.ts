import { Injectable } from '@nestjs/common';

export interface SellerCredentials {
  /** Token OAuth do lojista (split): as chamadas de cobrança saem com ele, não com o da plataforma. */
  accessToken: string;
  /** Conta do lojista no provedor (`user_id` do MP): é o recebedor esperado na re-consulta (SEC-034). */
  providerAccountId: string;
}

export type SellerCredentialsResolver = (storeId: string) => Promise<SellerCredentials | null>;

/**
 * Quem guarda os tokens (módulo de lojas, cifrados) se registra aqui; o adaptador do provedor só pergunta. Evita o ciclo
 * payments -> stores -> payments e mantém os tokens fora do módulo de pagamentos.
 */
@Injectable()
export class SellerCredentialsRegistry {
  private resolver: SellerCredentialsResolver | null = null;

  register(resolver: SellerCredentialsResolver): void {
    this.resolver = resolver;
  }

  async resolve(storeId: string): Promise<SellerCredentials | null> {
    return this.resolver ? this.resolver(storeId) : null;
  }
}
