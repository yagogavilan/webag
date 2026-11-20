/** Variações (WB-061, R-25): até 3 atributos, combinações únicas sem diferenciar caixa nem espaços. */
export const MAX_ATTRIBUTES = 3;

export type Attributes = Record<string, string>;

const norm = (value: string): string => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

/** Chave canônica da combinação: `P` = `p` = `P ` (O2-VAR-02). */
export function attributesKey(attributes: Attributes): string {
  return JSON.stringify(
    Object.entries(attributes)
      .map(([name, value]) => [norm(name), norm(value)] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

export interface VariantInput {
  attributes: Attributes;
  stock: number;
  priceCents?: number | null;
  sku?: string | null;
}

export function validateVariantSet(attributeNames: string[], variants: VariantInput[], maxCombinations: number): { field: string; message: string }[] {
  const issues: { field: string; message: string }[] = [];
  if (attributeNames.length > MAX_ATTRIBUTES) issues.push({ field: 'attributes', message: `No máximo ${MAX_ATTRIBUTES} atributos.` });
  if (new Set(attributeNames.map(norm)).size !== attributeNames.length) issues.push({ field: 'attributes', message: 'Atributos repetidos.' });
  if (variants.length > maxCombinations) issues.push({ field: 'variants', message: `No máximo ${maxCombinations} combinações.` });
  const wanted = attributeNames.map(norm).sort();
  const seen = new Set<string>();
  const skus = new Set<string>();
  variants.forEach((variant, index) => {
    const names = Object.keys(variant.attributes).map(norm).sort();
    if (JSON.stringify(names) !== JSON.stringify(wanted)) issues.push({ field: `variants[${index}].attributes`, message: 'Informe todos os atributos da variação.' });
    if (Object.values(variant.attributes).some((v) => norm(v) === '')) issues.push({ field: `variants[${index}].attributes`, message: 'Valor de atributo vazio.' });
    const key = attributesKey(variant.attributes);
    if (seen.has(key)) issues.push({ field: `variants[${index}].attributes`, message: 'Essa combinação já existe' });
    seen.add(key);
    if (variant.sku) {
      const sku = variant.sku.trim().toLowerCase();
      if (skus.has(sku)) issues.push({ field: `variants[${index}].sku`, message: 'Código repetido.' });
      skus.add(sku);
    }
  });
  return issues;
}
