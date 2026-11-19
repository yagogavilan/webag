import { normalizeWord } from './moderation.js';
import { MAX_PRICE_CENTS, MIN_PRICE_CENTS } from './price.js';
import { MAX_STOCK } from './stock.js';
/** Importação por planilha (WB-065). Só CSV (UTF-8; vírgula ou ponto e vírgula). Sem coluna de foto (C6: fetch de mídia externa fica de fora). */
export const IMPORT_MAX_LINES = 500;
export const IMPORT_MAX_BYTES = 1024 * 1024;
export const IMPORT_HEADERS = ['nome', 'categoria', 'descricao', 'preco', 'promocional', 'promo_inicio', 'promo_fim', 'variacao1', 'variacao2', 'estoque', 'codigo'];
export const IMPORT_TEMPLATE = `${IMPORT_HEADERS.join(';')}\r\nCamiseta básica;Roupas;Algodão, várias cores;49,90;39,90;01/12/2026 00:00;31/12/2026 23:59;Tamanho: P;Cor: Azul;10;CAM-P-AZ\r\nCamiseta básica;Roupas;Algodão, várias cores;49,90;39,90;01/12/2026 00:00;31/12/2026 23:59;Tamanho: M;Cor: Azul;8;CAM-M-AZ\r\n`;
/** CSV (RFC 4180): aspas duplas, aspas escapadas por `""`, quebra de linha dentro de campo entre aspas. */
export function parseCsv(input) {
    const text = input.replace(new RegExp(`^${String.fromCharCode(0xfeff)}`), '');
    const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
    const delimiter = firstLine.split(';').length >= firstLine.split(',').length ? ';' : ',';
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (char === '"' && text[i + 1] === '"') {
                cell += '"';
                i++;
            }
            else if (char === '"')
                quoted = false;
            else
                cell += char;
        }
        else if (char === '"' && cell === '')
            quoted = true;
        else if (char === delimiter) {
            row.push(cell);
            cell = '';
        }
        else if (char === '\n' || char === '\r') {
            if (char === '\r' && text[i + 1] === '\n')
                i++;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        }
        else
            cell += char;
    }
    if (cell !== '' || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
/** `19,90`, `1.234,56`, `R$ 5` e `19.90` viram centavos; mais de 2 casas decimais ou lixo → null. */
export function parseMoneyCents(raw) {
    const text = raw.replace(/R\$/gi, '').replace(/\s/g, '');
    if (text === '')
        return null;
    let normalized = text;
    if (text.includes(','))
        normalized = text.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(text))
        normalized = text.replace(/\./g, '');
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
    if (!match)
        return null;
    return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0');
}
/** `dd/mm/aaaa hh:mm` ou `aaaa-mm-dd hh:mm` em America/Sao_Paulo (UTC-3, sem horário de verão desde 2019). */
export function parseLocalDateTime(raw, defaultTime) {
    const text = raw.trim();
    const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/.exec(text);
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(text);
    const parts = br ? { y: br[3], m: br[2], d: br[1], hh: br[4], mm: br[5] } : iso ? { y: iso[1], m: iso[2], d: iso[3], hh: iso[4], mm: iso[5] } : null;
    if (!parts)
        return null;
    const [dh, dm] = defaultTime.split(':');
    const date = new Date(`${parts.y}-${parts.m}-${parts.d}T${parts.hh ?? dh}:${parts.mm ?? dm}:00-03:00`);
    // `new Date` aceita 31/02 e vira março: confere que o dia ficou o mesmo (fuso fixo -03:00).
    const local = new Date(date.getTime() - 3 * 3_600_000);
    return Number.isNaN(date.getTime()) || local.getUTCMonth() + 1 !== Number(parts.m) || local.getUTCDate() !== Number(parts.d) ? null : date;
}
const splitAttribute = (cell) => {
    const at = cell.indexOf(':');
    if (at < 1)
        return null;
    const name = cell.slice(0, at).trim();
    const value = cell.slice(at + 1).trim();
    return name && value ? [name.slice(0, 30), value.slice(0, 40)] : null;
};
/** Valida o arquivo inteiro (cabeçalho, limites) e cada linha; linhas boas viram produtos agrupados pelo nome. */
export function planImport(csv, categoriesByName, maxCombinations, maxLines = IMPORT_MAX_LINES) {
    if (Buffer.byteLength(csv) > IMPORT_MAX_BYTES)
        return { fileError: 'O arquivo passa do limite de 1 MB.' };
    const rows = parseCsv(csv);
    const header = rows[0]?.map((h) => normalizeWord(h).trim());
    if (!header || IMPORT_HEADERS.some((h) => !header.includes(h)))
        return { fileError: `Cabeçalho inválido. Use o modelo (colunas: ${IMPORT_HEADERS.join(', ')}).` };
    const body = rows.slice(1);
    if (body.length === 0)
        return { fileError: 'A planilha não tem linhas de produto.' };
    if (body.length > maxLines)
        return { fileError: `A planilha passa de ${maxLines} linhas.` };
    const col = (row, name) => (row[header.indexOf(name)] ?? '').trim();
    const errors = [];
    const groups = new Map();
    const seenSkus = new Map();
    body.forEach((row, index) => {
        const line = index + 2;
        const fail = (message) => void errors.push({ line, message });
        const name = col(row, 'nome');
        if (name.length < 2 || [...name].length > 80)
            return fail('Nome entre 2 e 80 caracteres.');
        const categoryId = categoriesByName.get(normalizeWord(col(row, 'categoria')));
        if (!categoryId)
            return fail('Categoria não encontrada ou inativa.');
        const description = col(row, 'descricao');
        if ([...description].length > 1000)
            return fail('Descrição passa de 1.000 caracteres.');
        const price = parseMoneyCents(col(row, 'preco'));
        if (price === null || price < MIN_PRICE_CENTS || price > MAX_PRICE_CENTS)
            return fail('Preço inválido (de R$ 0,01 a R$ 99.999,99, até 2 casas decimais).');
        let promoPriceCents = null;
        let promoStartsAt = null;
        let promoEndsAt = null;
        if ([col(row, 'promocional'), col(row, 'promo_inicio'), col(row, 'promo_fim')].some((c) => c !== '')) {
            promoPriceCents = parseMoneyCents(col(row, 'promocional'));
            promoStartsAt = parseLocalDateTime(col(row, 'promo_inicio'), '00:00');
            promoEndsAt = parseLocalDateTime(col(row, 'promo_fim'), '23:59');
            if (promoPriceCents === null || !promoStartsAt || !promoEndsAt)
                return fail('Promoção incompleta: informe preço, início e fim.');
            if (promoPriceCents < MIN_PRICE_CENTS || promoPriceCents >= price)
                return fail('O preço promocional precisa ser menor que o normal.');
            if (promoEndsAt.getTime() < promoStartsAt.getTime())
                return fail('O fim da promoção precisa ser depois do início.');
            promoEndsAt = new Date(Math.floor(promoEndsAt.getTime() / 60_000) * 60_000 + 59_999);
        }
        const attributes = {};
        for (const key of ['variacao1', 'variacao2']) {
            const cell = col(row, key);
            if (cell === '')
                continue;
            const pair = splitAttribute(cell);
            if (!pair)
                return fail(`Variação inválida em "${key}". Use "Nome: valor" (ex.: Tamanho: P).`);
            attributes[pair[0]] = pair[1];
        }
        if (Object.keys(attributes).length === 2 && new Set(Object.keys(attributes).map(normalizeWord)).size < 2)
            return fail('Atributos repetidos.');
        const stockRaw = col(row, 'estoque');
        const stock = /^\d+$/.test(stockRaw) ? Number(stockRaw) : Number.NaN;
        if (!Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK)
            return fail('Estoque inválido (inteiro de 0 a 99.999).');
        const sku = col(row, 'codigo') || null;
        if (sku && sku.length > 40)
            return fail('Código (SKU) passa de 40 caracteres.');
        if (sku) {
            const first = seenSkus.get(sku.toLowerCase());
            if (first)
                return fail(`Código "${sku}" repetido (já na linha ${first}).`);
            seenSkus.set(sku.toLowerCase(), line);
        }
        const key = normalizeWord(name);
        let product = groups.get(key);
        if (!product) {
            product = { name, categoryId, description: description || null, basePriceCents: price, promoPriceCents, promoStartsAt, promoEndsAt, attributeNames: Object.keys(attributes), variants: [] };
            groups.set(key, product);
        }
        else if (product.basePriceCents !== price || product.categoryId !== categoryId) {
            return fail('Linhas do mesmo produto precisam ter o mesmo preço e a mesma categoria.');
        }
        else if (JSON.stringify(Object.keys(attributes).map(normalizeWord).sort()) !== JSON.stringify(product.attributeNames.map(normalizeWord).sort())) {
            return fail('Linhas do mesmo produto precisam usar os mesmos atributos de variação.');
        }
        const combo = JSON.stringify(Object.entries(attributes).map(([k, v]) => [normalizeWord(k), normalizeWord(v)]).sort());
        if (product.variants.some((v) => JSON.stringify(Object.entries(v.attributes).map(([k, val]) => [normalizeWord(k), normalizeWord(val)]).sort()) === combo))
            return fail('Essa combinação já existe');
        if (product.variants.length >= maxCombinations)
            return fail(`No máximo ${maxCombinations} combinações por produto.`);
        product.variants.push({ attributes, stock, sku, line });
    });
    return { products: [...groups.values()], errors: errors.sort((a, b) => a.line - b.line), totalLines: body.length };
}
//# sourceMappingURL=import.js.map