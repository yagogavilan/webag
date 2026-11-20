/**
 * TEXTOS LEGAIS DA CONTA (exportar dados e excluir conta). RASCUNHO PARA REVISÃO JURÍDICA (CC4, `docs/seguranca/lgpd.md`):
 * nada aqui foi aprovado por advogado. Os prazos NUNCA são fixos no texto: vêm de `GET /me/deletion` (parâmetros do admin).
 * Itens abertos para revisão: `docs/arquitetura/pendencias-contrato-web-lojista.md`, O6-6.
 */
import type { AccountDeletionOverview } from '@/lib/api/account';

export const EXPORT_COPY = {
  title: 'Meus dados',
  intro: 'Peça uma cópia dos dados da sua conta. Você recebe um arquivo em formato JSON, que abre em qualquer editor de texto.',
  how: 'Avisamos por e-mail quando o arquivo ficar pronto. O e-mail não traz o arquivo nem o link: você volta aqui para baixar. O link vale poucos minutos e só funciona uma vez. É possível pedir uma exportação por dia.',
  passwordWhy: 'Para proteger seus dados, confirme com a sua senha.',
} as const;

/** "72 horas (3 dias)", "24 horas", "1 hora". */
export function hoursText(hours: number): string {
  if (hours === 1) return '1 hora';
  if (hours > 24 && hours % 24 === 0) return `${hours} horas (${hours / 24} dias)`;
  return `${hours} horas`;
}
const daysText = (days: number): string => `${days} ${days === 1 ? 'dia' : 'dias'}`;
const yearsText = (years: number): string => `${years} ${years === 1 ? 'ano' : 'anos'}`;

export const DELETE_COPY = {
  title: 'Excluir minha conta',
  intro: 'Ao excluir, você deixa de acessar o painel e os seus dados pessoais são apagados ou anonimizados.',
  blockedTitle: 'Antes de excluir, conclua o que está em aberto',
  blockedText: 'Não é possível excluir a conta enquanto houver pedido, troca ou estorno em andamento. Quando terminarem, volte aqui.',
  adminNotDeletable: 'Contas de administração não são excluídas por aqui. Peça a um super admin para remover o seu acesso em Administradores.',
  noPassword: 'Esta conta entra com login social e não tem senha. Defina uma senha em "Esqueci a senha" na tela de entrada e volte aqui.',
  confirmTitle: 'Excluir a conta?',
  passwordWhy: 'Confirme com a sua senha. Não enviamos código por e-mail para esta ação.',
} as const;

/** "O que acontece": cada linha sai dos números reais da API (`regretHours`, `anonymizationDays`, `fiscalRetentionYears`, `ownsStore`). */
export function deletionEffects(overview: Pick<AccountDeletionOverview, 'regretHours' | 'anonymizationDays' | 'fiscalRetentionYears' | 'ownsStore'>): string[] {
  const lines = ['A sua conta fecha agora e todos os aparelhos saem da sessão.'];
  if (overview.ownsStore) lines.push('A sua loja é encerrada e deixa de aparecer para os clientes.');
  if (overview.regretHours > 0) {
    lines.push(`Você tem ${hoursText(overview.regretHours)} para desistir. Nesse prazo, entre em "Desistir da exclusão", na tela de entrada, com o seu e-mail e a sua senha para reativar a conta${overview.ownsStore ? ' e reabrir a loja' : ''}.`);
    lines.push(`Passado o prazo, a exclusão não pode ser desfeita e os dados pessoais são anonimizados em até ${daysText(overview.anonymizationDays)}.`);
  } else {
    lines.push(`A exclusão é imediata e não pode ser desfeita. Os dados pessoais são anonimizados em até ${daysText(overview.anonymizationDays)}.`);
  }
  lines.push(`Por obrigação legal, dados de pedidos e de pagamentos ficam guardados por ${yearsText(overview.fiscalRetentionYears)} e só são usados para cumprir essa obrigação.`);
  return lines;
}

export const DELETED_COPY = {
  pendingTitle: 'Conta fechada',
  completedTitle: 'Conta excluída',
  completedText: 'A sua conta foi excluída. Obrigado por ter usado o Webag.',
} as const;
