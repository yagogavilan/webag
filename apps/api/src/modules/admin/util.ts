/** Violação de unicidade do PostgreSQL (23505), inclusive embrulhada pelo Drizzle (`cause`). */
export function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown): unknown => (e && typeof e === 'object' ? (e as { code?: unknown }).code : undefined);
  return code(error) === '23505' || code((error as { cause?: unknown } | null)?.cause) === '23505';
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
