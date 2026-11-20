const POPULAR_DOMAINS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com.br', 'icloud.com', 'uol.com.br', 'bol.com.br'];

export const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[a.length]![b.length]!;
}

/** WB-006 C6: "Você quis dizer gmail.com?". Devolve o domínio sugerido ou null se o digitado já é popular ou distante demais. */
export function suggestEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (domain.length < 4 || POPULAR_DOMAINS.includes(domain)) return null;
  let best: { domain: string; d: number } | null = null;
  for (const candidate of POPULAR_DOMAINS) {
    const d = distance(domain, candidate);
    if (d <= 2 && (!best || d < best.d)) best = { domain: candidate, d };
  }
  return best?.domain ?? null;
}

/** m***@gmail.com: só para mostrar onde o código foi enviado quando quem digita pode não ser o dono (step-up). */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return email;
  return `${email[0]}***${email.slice(at)}`;
}
