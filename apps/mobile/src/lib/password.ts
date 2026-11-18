export type PasswordStrength = 'weak' | 'medium' | 'strong';

export interface StrengthResult {
  /** 0 a 4 segmentos preenchidos no medidor. */
  score: 0 | 1 | 2 | 3 | 4;
  label: PasswordStrength;
}

const COMMON = new Set([
  '12345678', '123456789', '1234567890', 'password', 'senha123', 'senha1234', 'qwertyui', 'qwerty123',
  'brasil123', 'abc12345', '11111111', '00000000', 'iloveyou', 'mudar123', 'admin123', 'webag123',
]);

/**
 * Medidor local, só orientação visual. Quem decide é o servidor (8 a 128 caracteres e lista de comuns, 422 WEAK_PASSWORD).
 * Não usa dicionário grande (zxcvbn) de propósito: pesa no Android de entrada e a regra real é do servidor.
 */
export function passwordStrength(password: string): StrengthResult {
  if (password.length === 0) return { score: 0, label: 'weak' };
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return { score: 1, label: 'weak' };

  let points = 0;
  if (password.length >= 8) points += 1;
  if (password.length >= 12) points += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points += 1;
  if (/\d/.test(password) && /[a-zA-Z]/.test(password)) points += 1;
  if (/[^A-Za-z0-9]/.test(password)) points += 1;
  if (password.length < 8) points = Math.min(points, 1);

  // 0-2 pontos: fraca (1 ou 2 segmentos); 3-4: média (3 segmentos); 5: forte (4 segmentos).
  if (points <= 2) return { score: points <= 1 ? 1 : 2, label: 'weak' };
  if (points <= 4) return { score: 3, label: 'medium' };
  return { score: 4, label: 'strong' };
}

/** Regra mínima de cliente (a mesma mensagem do servidor): 8+ caracteres com letras e números. */
export const isAcceptablePassword = (password: string): boolean =>
  password.length >= 8 && password.length <= 128 && /[a-zA-Z]/.test(password) && /\d/.test(password);
