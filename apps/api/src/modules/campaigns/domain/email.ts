/**
 * SEC-226: identificador de CONTA por e-mail normalizado. Minúsculo; Gmail e Googlemail sem pontos e sem `+tag`; os demais provedores sem `+tag`.
 * `a.b+1@gmail.com` e `ab@gmail.com` caem no mesmo identificador. Não valida o formato (isso é de quem cadastra): devolve `null` se não parece e-mail.
 */
export function normalizeEmailForFraud(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at < 1 || at === trimmed.length - 1) return null;
  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replaceAll('.', '');
  if (local.length === 0) return null;
  return `${local}@${domain}`;
}
