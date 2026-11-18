import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../platform/config/env.js';
import { AppError } from '../../../platform/http/app-error.js';
import type {
  PaymentProvider,
  ProviderPayment,
  WebhookNotification,
} from '../payment-provider.js';
import { validateWebhookSignature, WEBHOOK_TOLERANCE_SECONDS } from '../webhook-signature.js';

const NOT_IMPLEMENTED = (what: string) =>
  new AppError(501, 'MERCADOPAGO_NOT_IMPLEMENTED', 'Mercado Pago ainda não integrado', {
    detail: `${what}: adaptador será implementado na Onda 4A (WB-151/152/154), com as credenciais do fundador.`,
  });

/**
 * Esqueleto do adaptador do Mercado Pago (ADR-002). Só a validação de assinatura do webhook está pronta: ela não
 * depende de credencial além do segredo. As chamadas de API (criar PIX, cartão, consultar, estornar) entram na
 * Onda 4A, com respostas gravadas como fixture e o token da loja resolvido pela tentativa (SEC-034).
 * Pendências externas (fundador): MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET e conta de integração; ver docs/seguranca/requisitos-seguranca.md.
 */
@Injectable()
export class MercadoPagoPaymentProvider implements PaymentProvider {
  readonly name = 'mercadopago' as const;

  constructor(private readonly config: ConfigService<Env, true>) {}

  expectedReceiverId(storeId: string | null): string | null {
    // Onda 4A: id da conta MP da loja, guardado após o OAuth (WB-053).
    return storeId;
  }

  createPayment(): Promise<ProviderPayment> {
    return Promise.reject(NOT_IMPLEMENTED('Criar pagamento'));
  }

  getPayment(): Promise<ProviderPayment | null> {
    return Promise.reject(NOT_IMPLEMENTED('Consultar pagamento'));
  }

  refund(): Promise<{ providerRefundId: string; amountCents: number }> {
    return Promise.reject(NOT_IMPLEMENTED('Estornar pagamento'));
  }

  verifyWebhook({ headers, query }: Parameters<PaymentProvider['verifyWebhook']>[0]): WebhookNotification {
    const secret = this.config.get('MP_WEBHOOK_SECRET', { infer: true });
    if (!secret) throw new AppError(503, 'WEBHOOK_NOT_CONFIGURED', 'Webhook não configurado');
    const signature = headers['x-signature'];
    const requestId = headers['x-request-id'];
    const dataId = query['data.id'];
    const verdict = validateWebhookSignature({
      secret,
      signatureHeader: typeof signature === 'string' ? signature : undefined,
      requestId: typeof requestId === 'string' ? requestId : null,
      dataId: typeof dataId === 'string' ? dataId : undefined,
      toleranceSeconds: WEBHOOK_TOLERANCE_SECONDS,
    });
    // Notificação sem x-signature (IPN legado, QR) cai aqui como `missing`: 401 (SEC-032).
    if (!verdict.ok) throw new AppError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Assinatura inválida', { detail: `Notificação recusada (${verdict.reason}).` });
    const type = typeof query.type === 'string' ? query.type : 'payment';
    return {
      eventKey: typeof requestId === 'string' && requestId ? requestId : `${String(dataId)}:${type}:${verdict.tsMs}`,
      providerPaymentId: String(dataId),
      type,
    };
  }
}
