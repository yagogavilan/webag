/** Variações (WB-061, R-25): até 3 atributos, combinações únicas sem diferenciar caixa nem espaços. */
export const MAX_ATTRIBUTES = 3;
const norm = (value) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
/** Chave canônica da combinação: `P` = `p` = `P ` (O2-VAR-02). */
export function attributesKey(attributes) {
    return JSON.stringify(Object.entries(attributes)
        .map(([name, value]) => [norm(name), norm(value)])
        .sort(([a], [b]) => a.localeCompare(b)));
}
export function validateVariantSet(attributeNames, variants, maxCombinations) {
    const issues = [];
    if (attributeNames.length > MAX_ATTRIBUTES)
        issues.push({ field: 'attributes', message: `No máximo ${MAX_ATTRIBUTES} atributos.` });
    if (new Set(attributeNames.map(norm)).size !== attributeNames.length)
        issues.push({ field: 'attributes', message: 'Atributos repetidos.' });
    if (variants.length > maxCombinations)
        issues.push({ field: 'variants', message: `No máximo ${maxCombinations} combinações.` });
    const wanted = attributeNames.map(norm).sort();
    const seen = new Set();
    const skus = new Set();
    variants.forEach((variant, index) => {
        const names = Object.keys(variant.attributes).map(norm).sort();
        if (JSON.stringify(names) !== JSON.stringify(wanted))
            issues.push({ field: `variants[${index}].attributes`, message: 'Informe todos os atributos da variação.' });
        if (Object.values(variant.attributes).some((v) => norm(v) === ''))
            issues.push({ field: `variants[${index}].attributes`, message: 'Valor de atributo vazio.' });
        const key = attributesKey(variant.attributes);
        if (seen.has(key))
            issues.push({ field: `variants[${index}].attributes`, message: 'Essa combinação já existe' });
        seen.add(key);
        if (variant.sku) {
            const sku = variant.sku.trim().toLowerCase();
            if (skus.has(sku))
                issues.push({ field: `variants[${index}].sku`, message: 'Código repetido.' });
            skus.add(sku);
        }
    });
    return issues;
}
//# sourceMappingURL=variants.js.map