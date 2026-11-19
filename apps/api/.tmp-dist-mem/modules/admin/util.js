/** Violação de unicidade do PostgreSQL (23505), inclusive embrulhada pelo Drizzle (`cause`). */
export function isUniqueViolation(error) {
    const code = (e) => (e && typeof e === 'object' ? e.code : undefined);
    return code(error) === '23505' || code(error?.cause) === '23505';
}
export function slugify(text) {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
//# sourceMappingURL=util.js.map