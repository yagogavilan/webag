/** RN-03 / HIP-030: aprovada, conta de recebimento ativa e 1+ produto ativo (suspensa nunca aparece). */
export function isStoreVisible(input) {
    return input.status === 'approved' && input.paymentAccountActive && input.activeProducts >= 1;
}
//# sourceMappingURL=visibility.js.map