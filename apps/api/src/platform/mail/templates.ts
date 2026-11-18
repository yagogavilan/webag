import type { MailMessage } from './mail.service.js';

type Body = Omit<MailMessage, 'to'>;

const footer = 'Precisa de ajuda? Responda pelo suporte no app Webag.';

const html = (title: string, lines: string[]): string =>
  `<div style="font-family:Arial,sans-serif;max-width:480px"><h2>${title}</h2>${lines
    .map((line) => `<p>${line}</p>`)
    .join('')}<p style="color:#666;font-size:12px">${footer}</p></div>`;

/**
 * Código por e-mail. SEC-008(d) / WB-224 C6: só o código e texto genérico, sem nome, endereço, itens ou valores,
 * para qualquer finalidade (o destinatário pode não ser o dono do e-mail).
 */
export function codeEmail(code: string, validityMinutes: number): Body {
  const lines = [
    `Seu código de verificação Webag é <strong style="font-size:24px;letter-spacing:4px">${code}</strong>.`,
    `Ele vale por ${validityMinutes} minutos e só pode ser usado uma vez.`,
    'Se você não pediu este código, ignore este e-mail.',
  ];
  return {
    subject: `Seu código Webag: ${code}`,
    text: `Seu código de verificação Webag é ${code}. Vale por ${validityMinutes} minutos e só pode ser usado uma vez. Se você não pediu, ignore este e-mail.\n\n${footer}`,
    html: html('Código de verificação', lines),
  };
}

export function passwordChangedEmail(): Body {
  return {
    subject: 'Sua senha Webag foi alterada',
    text: `A senha da sua conta Webag foi alterada. Se não foi você, redefina a senha agora pelo app (Esqueci a senha) e fale com o suporte.\n\n${footer}`,
    html: html('Sua senha foi alterada', [
      'A senha da sua conta Webag foi alterada.',
      'Se não foi você, redefina a senha agora pelo app (Esqueci a senha) e fale com o suporte.',
    ]),
  };
}

export function loginAttemptsEmail(): Body {
  return {
    subject: 'Tentativas de acesso na sua conta Webag',
    text: `Detectamos várias tentativas de acesso na sua conta Webag. Sua conta continua protegida. Se não foi você, redefina sua senha.\n\n${footer}`,
    html: html('Tentativas de acesso na sua conta', [
      'Detectamos várias tentativas de acesso na sua conta.',
      'Sua conta continua protegida. Se não foi você, redefina sua senha.',
    ]),
  };
}

export function adminInviteEmail(link: string, hours: number): Body {
  return {
    subject: 'Convite para o painel administrativo Webag',
    text: `Você foi convidado para o painel administrativo Webag. Crie sua senha e configure a verificação em duas etapas: ${link}\nO convite vale por ${hours} horas e só pode ser usado uma vez.\n\n${footer}`,
    html: html('Convite para o painel administrativo', [
      `Crie sua senha e configure a verificação em duas etapas: <a href="${link}">aceitar convite</a>.`,
      `O convite vale por ${hours} horas e só pode ser usado uma vez.`,
    ]),
  };
}

export function emailChangedNoticeEmail(): Body {
  return {
    subject: 'O e-mail da sua conta Webag está sendo alterado',
    text: `Foi pedida a troca do e-mail da sua conta Webag. Se não foi você, redefina sua senha.\n\n${footer}`,
    html: html('Troca de e-mail da conta', ['Foi pedida a troca do e-mail da sua conta.', 'Se não foi você, redefina sua senha.']),
  };
}

/** SEC-091(b): senha certa, código errado 3 vezes. */
export function mfaThreeErrorsEmail(): Body {
  return {
    subject: 'Alerta de segurança: sua senha Webag foi digitada corretamente, mas o código errou',
    text: `Sua senha foi digitada corretamente, mas o código de verificação em duas etapas errou. Se não foi você, troque sua senha e avise o suporte.\n\n${footer}`,
    html: html('Código de verificação errado', ['Sua senha foi digitada corretamente, mas o código de verificação em duas etapas errou.', 'Se não foi você, troque sua senha e avise o suporte.']),
  };
}

/** SEC-091(c): 10 erros em 24 h, a senha foi invalidada. */
export function mfaBruteforceEmail(email: string, toOwner: boolean): Body {
  const line = toOwner
    ? 'Detectamos muitas tentativas erradas do código de verificação. Por segurança, sua senha foi invalidada e suas sessões encerradas. Use "Esqueci a senha" (com o app autenticador) para voltar.'
    : `Possível ataque de força bruta ao segundo fator da conta ${email}. A senha dela foi invalidada e as sessões encerradas.`;
  return {
    subject: 'Alerta de segurança: tentativas suspeitas no segundo fator',
    text: `${line}\n\n${footer}`,
    html: html('Tentativas suspeitas no segundo fator', [line]),
  };
}

/** SEC-093: link de reativação enviado só ao e-mail cadastrado. */
export function accessResetEmail(link: string, hours: number): Body {
  return {
    subject: 'Reative seu acesso ao painel administrativo Webag',
    text: `Um super admin redefiniu o seu acesso ao painel. Crie uma senha nova e configure a verificação em duas etapas: ${link}\nO link vale por ${hours} horas e só pode ser usado uma vez.\n\n${footer}`,
    html: html('Reative seu acesso', [`Crie uma senha nova e configure a verificação em duas etapas: <a href="${link}">reativar acesso</a>.`, `O link vale por ${hours} horas e só pode ser usado uma vez.`]),
  };
}

/** SEC-092: aviso ao titular quando um código de recuperação é usado. Nunca inclui o código. */
export function recoveryCodeUsedEmail(remaining: number): Body {
  return {
    subject: 'Um código de recuperação da sua conta Webag foi usado',
    text: `Um código de recuperação foi usado para entrar no painel. Restam ${remaining}. Você precisará configurar o app autenticador de novo. Se não foi você, avise um super admin agora.\n\n${footer}`,
    html: html('Código de recuperação usado', [`Um código de recuperação foi usado para entrar no painel. Restam ${remaining}.`, 'Você precisará configurar o app autenticador de novo. Se não foi você, avise um super admin agora.']),
  };
}

export function recoveryCodesRegeneratedEmail(): Body {
  return {
    subject: 'Novos códigos de recuperação gerados na sua conta Webag',
    text: `Você gerou novos códigos de recuperação. Os anteriores deixaram de valer. Se não foi você, avise um super admin agora.\n\n${footer}`,
    html: html('Novos códigos de recuperação', ['Você gerou novos códigos de recuperação. Os anteriores deixaram de valer.', 'Se não foi você, avise um super admin agora.']),
  };
}

/** SEC-095: aviso de senha do painel alterada (ao titular e, em versão resumida, aos outros super admins). */
export function panelPasswordChangedEmail(email: string, toOwner: boolean): Body {
  const line = toOwner
    ? 'A senha do seu acesso ao painel foi alterada com código do e-mail e verificação em duas etapas. Se não foi você, avise um super admin agora.'
    : `A senha do painel da conta ${email} foi redefinida por "Esqueci a senha". Se isso não era esperado, investigue.`;
  return { subject: 'Sua senha do painel Webag foi alterada', text: `${line}\n\n${footer}`, html: html('Senha do painel alterada', [line]) };
}

/** SEC-093 / SEC-094: aviso de redefinição de acesso (ao alvo e aos super admins). */
export function accessResetNoticeEmail(targetEmail: string, origin: 'super_admin' | 'cli' | 'cli_override', toTarget: boolean): Body {
  const how =
    origin === 'super_admin'
      ? 'por um super admin'
      : origin === 'cli'
        ? 'pelo procedimento de emergência no servidor'
        : 'pelo procedimento de emergência no servidor, ignorando a existência de outro super admin';
  const line = toTarget
    ? `O seu acesso ao painel foi redefinido ${how}. Você receberá um link separado para criar uma senha nova. Se não esperava, avise um super admin.`
    : `O acesso da conta ${targetEmail} ao painel foi redefinido ${how}. Se isso não era esperado, investigue.`;
  return { subject: 'Acesso ao painel Webag redefinido', text: `${line}\n\n${footer}`, html: html('Acesso redefinido', [line]) };
}

/** SEC-094: alerta extra quando o break-glass ignora a existência de outro super admin. */
export function breakGlassOverrideEmail(targetEmail: string): Body {
  const line = `ATENÇÃO: o acesso da conta ${targetEmail} foi redefinido pelo procedimento de emergência no servidor MESMO existindo outro super admin ativo (--override-other-super-admins). Confirme se isso era esperado.`;
  return { subject: 'ALERTA: redefinição de emergência com override no painel Webag', text: `${line}\n\n${footer}`, html: html('Redefinição de emergência com override', [line]) };
}

/** SEC-048: aviso ao dono (e, resumido, aos super admins) quando a conta de recebimento muda ou é desconectada. */
export function paymentAccountChangedEmail(storeName?: string, toAdmin = false): Body {
  const line = toAdmin
    ? `A conta de recebimento da loja ${storeName ?? ''} foi alterada ou desconectada. Confira se era esperado.`
    : 'A conta de recebimento da sua loja foi alterada ou desconectada. Se não foi você, entre em contato com o suporte agora.';
  return { subject: toAdmin ? 'Conta de recebimento de loja alterada' : 'Sua conta de recebimento no Webag mudou', text: `${line}\n\n${footer}`, html: html('Conta de recebimento alterada', [line]) };
}

export function paymentAccountUnderReviewEmail(): Body {
  const line = 'O titular da conta conectada é diferente do cadastro da loja. Aguarde a análise ou conecte outra conta. A venda só começa depois da liberação.';
  return { subject: 'Sua conta de recebimento está em análise', text: `${line}\n\n${footer}`, html: html('Conta em análise', [line]) };
}

/** Decisões sobre a loja (WB-103/104): aprovada, correção pedida, recusada, suspensa, reativada. */
export function storeDecisionEmail(kind: 'approved' | 'correction' | 'rejected' | 'suspended' | 'reactivated', storeName: string, detail?: string): Body {
  const titles = {
    approved: 'Sua loja foi aprovada',
    correction: 'Sua loja precisa de correções',
    rejected: 'Sua loja não foi aprovada',
    suspended: 'Sua loja foi suspensa',
    reactivated: 'Sua loja foi reativada',
  } as const;
  const lines = {
    approved: [`A loja ${storeName} foi aprovada. Ela aparece para os clientes quando tiver a conta de recebimento ativa e 1 produto ativo.`],
    correction: [`Pedimos ajustes na loja ${storeName}. Veja os itens no painel, corrija só o que foi pedido e reenvie.`, ...(detail ? [detail] : [])],
    rejected: [`A loja ${storeName} não foi aprovada.`, ...(detail ? [`Motivo: ${detail}`] : []), 'Para um novo cadastro, fale com o suporte.'],
    suspended: [`A loja ${storeName} foi suspensa e não aparece para os clientes.`, ...(detail ? [`Motivo: ${detail}`] : []), 'Fale com o suporte para entender o próximo passo.'],
    reactivated: [`A loja ${storeName} foi reativada.`],
  } as const;
  return { subject: titles[kind], text: `${lines[kind].join('\n')}\n\n${footer}`, html: html(titles[kind], [...lines[kind]]) };
}

export function productRemovedEmail(productName: string, reason: string, action: 'removed' | 'paused'): Body {
  const line = `O produto "${productName}" foi ${action === 'removed' ? 'removido' : 'pausado'} pela moderação. Motivo: ${reason}. Para contestar, escreva ao suporte.`;
  return { subject: `Produto ${action === 'removed' ? 'removido' : 'pausado'} pela moderação`, text: `${line}\n\n${footer}`, html: html('Moderação de produto', [line]) };
}

export function lowStockEmail(productName: string, variantLabel: string, available: number): Body {
  const line = `Estoque baixo: ${productName}${variantLabel ? ` (${variantLabel})` : ''} tem ${available} unidade(s) disponível(is).`;
  return { subject: 'Estoque baixo na sua loja', text: `${line}\n\n${footer}`, html: html('Estoque baixo', [line]) };
}

export function staffInviteEmail(link: string, storeName: string, days: number): Body {
  return {
    subject: `Convite para a equipe da loja ${storeName}`,
    text: `Você foi convidado para a equipe da loja ${storeName}. Crie sua senha: ${link}\nO link vale por ${days} dias e só pode ser usado uma vez.\n\n${footer}`,
    html: html('Convite para a equipe', [`Você foi convidado para a equipe da loja ${storeName}: <a href="${link}">criar minha senha</a>.`, `O link vale por ${days} dias e só pode ser usado uma vez.`]),
  };
}
