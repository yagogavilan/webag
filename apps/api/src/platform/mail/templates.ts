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
