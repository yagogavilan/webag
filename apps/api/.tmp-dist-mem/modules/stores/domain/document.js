/** Remove máscara e padroniza em maiúsculas. Não valida. */
export const normalizeDocument = (raw) => raw.replace(/[.\-/\s]/g, '').toUpperCase();
const allSame = (value) => value.split('').every((char) => char === value[0]);
function checkDigit(chars, weights) {
    let sum = 0;
    for (let i = 0; i < weights.length; i++)
        sum += (chars.charCodeAt(i) - 48) * (weights[i] ?? 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
}
export function isValidCpf(raw) {
    const cpf = normalizeDocument(raw);
    if (!/^\d{11}$/.test(cpf) || allSame(cpf))
        return false;
    const d1 = checkDigit(cpf, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = checkDigit(cpf, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}
export function isValidCnpj(raw) {
    const cnpj = normalizeDocument(raw);
    if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || allSame(cnpj))
        return false;
    const d1 = checkDigit(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = checkDigit(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}
export const isValidDocument = (type, raw) => (type === 'cpf' ? isValidCpf(raw) : isValidCnpj(raw));
/** Máscara para quem não é dono nem admin (SEC-023): só os 2 últimos caracteres aparecem. */
export function maskDocument(raw) {
    const doc = normalizeDocument(raw);
    return `${'*'.repeat(Math.max(doc.length - 2, 0))}${doc.slice(-2)}`;
}
//# sourceMappingURL=document.js.map