/** Contrato único dos provedores (WB-150 C6): o domínio do pedido não sabe se o provedor é o `fake` ou o Mercado Pago. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
export class ProviderTimeoutError extends Error {
    constructor(message = 'Tempo esgotado no provedor de pagamento') {
        super(message);
        this.name = 'ProviderTimeoutError';
    }
}
//# sourceMappingURL=payment-provider.js.map