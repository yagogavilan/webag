/**
 * Fatos citados na página pública de exclusão. Os valores vêm dos parâmetros da plataforma (padrões: arrependimento de 72 h, guarda
 * fiscal de 5 anos, registros de acesso por 6 meses); a página pública não tem como ler os parâmetros, então este é o único lugar a
 * ajustar se mudarem. O app e a tela de confirmação mostram sempre o valor real. Prazos e bases legais: revisão jurídica pendente (J14).
 */
export const DELETION_FACTS = {
  regretHours: 72,
  fiscalRetentionYears: 5,
  accessLogMonths: 6,
  privacyAnswerDays: 15,
} as const;
