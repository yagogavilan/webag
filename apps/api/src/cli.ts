import 'reflect-metadata';
import { hostname, userInfo } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { BreakGlassError, BreakGlassService } from './modules/identity/break-glass.service.js';
import { AccountDeletionService, DeletionOpsError } from './modules/privacy/account-deletion.service.js';
import { MailService } from './platform/mail/mail.service.js';

/**
 * CLI operacional (SEC-094). Roda só no servidor, sem rota HTTP:
 *   node dist/cli.js admin:reset-access --email <e> --reason "<texto>" [--confirm-email <e>] [--dry-run] [--override-other-super-admins]
 * Nunca imprime o link de reativação (ele vai só ao e-mail cadastrado). Runbook: docs/arquitetura/runbook-break-glass.md.
 */
const USAGE = `Uso: node dist/cli.js admin:reset-access --email <e> --reason "<motivo, >= 20 caracteres>" [--confirm-email <e>] [--dry-run] [--override-other-super-admins]
     node dist/cli.js privacy:cancel-deletion --email <e> --reason "<motivo, >= 20 caracteres>" --identity-proof "<como a identidade foi conferida, >= 10 caracteres>" [--confirm-email <e>] [--dry-run]`;

/**
 * SEC-180 (3): reabre a conta de uma exclusão pendente a pedido do dono, com a identidade conferida fora do sistema (docs/seguranca/runbook-dsr.md,
 * passo 5). Resolve também a conta com e-mail não confirmado sob ataque. Audita com ator `cli`, avisa o dono por e-mail e nunca imprime dado pessoal além do e-mail digitado.
 */
async function cancelDeletion(rest: string[]): Promise<number> {
  const { values } = parseArgs({
    args: rest,
    options: { email: { type: 'string' }, reason: { type: 'string' }, 'identity-proof': { type: 'string' }, 'confirm-email': { type: 'string' }, 'dry-run': { type: 'boolean', default: false } },
  });
  if (!values.email || !values.reason || !values['identity-proof']) {
    console.error(USAGE);
    return 2;
  }
  let confirmEmail = values['confirm-email'];
  if (!confirmEmail && process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    confirmEmail = await rl.question('Digite o e-mail do titular de novo para confirmar: ');
    rl.close();
  }
  if (!confirmEmail) {
    console.error('Informe --confirm-email (ou rode em terminal interativo para digitar a confirmação).');
    return 2;
  }
  process.env.WEBAG_CLI = '1';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  try {
    const result = await app.get(AccountDeletionService).cancelByOperator({
      email: values.email,
      confirmEmail,
      reason: values.reason,
      identityProof: values['identity-proof'],
      dryRun: values['dry-run'],
      osUser: userInfo().username,
      host: hostname(),
    });
    if (result.dryRun) {
      console.log(`[dry-run] Nada foi alterado. Reabriria a conta de ${result.email}${result.storeRestored ? ' e a loja encerrada com ela' : ''}.`);
    } else {
      await app.get(MailService).flush();
      console.log(`Conta de ${result.email} reaberta${result.storeRestored ? ' (e a loja)' : ''}. O titular foi avisado por e-mail; a auditoria registra o operador e a prova de identidade.`);
    }
    return 0;
  } catch (error) {
    if (error instanceof DeletionOpsError) {
      console.error(`Recusado (${error.code}): ${error.message}`);
      return 1;
    }
    throw error;
  } finally {
    await app.close();
  }
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'privacy:cancel-deletion') return cancelDeletion(rest);
  if (command !== 'admin:reset-access') {
    console.error(USAGE);
    return 2;
  }
  const { values } = parseArgs({
    args: rest,
    options: {
      email: { type: 'string' },
      reason: { type: 'string' },
      'confirm-email': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'override-other-super-admins': { type: 'boolean', default: false },
    },
  });
  if (!values.email || !values.reason) {
    console.error(USAGE);
    return 2;
  }
  let confirmEmail = values['confirm-email'];
  if (!confirmEmail && process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    confirmEmail = await rl.question('Digite o e-mail do admin de novo para confirmar: ');
    rl.close();
  }
  if (!confirmEmail) {
    console.error('Informe --confirm-email (ou rode em terminal interativo para digitar a confirmação).');
    return 2;
  }

  process.env.WEBAG_CLI = '1'; // desliga os timers de pagamento dentro do processo
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  try {
    const result = await app.get(BreakGlassService).resetAccess({
      email: values.email,
      confirmEmail,
      reason: values.reason,
      dryRun: values['dry-run'],
      overrideOtherSuperAdmins: values['override-other-super-admins'],
      osUser: userInfo().username,
      host: hostname(),
    });
    if (result.dryRun) {
      console.log(`[dry-run] Nada foi alterado. Redefiniria o acesso de ${result.email}${result.override ? ' (com override)' : ''}.`);
    } else {
      await app.get(MailService).flush();
      console.log(`Acesso de ${result.email} redefinido. O link de reativação foi enviado SOMENTE para o e-mail cadastrado (48 h, uso único).`);
    }
    return 0;
  } catch (error) {
    if (error instanceof BreakGlassError) {
      console.error(`Recusado (${error.code}): ${error.message}`);
      return 1;
    }
    throw error;
  } finally {
    await app.close();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error('Falha inesperada na CLI:', error instanceof Error ? error.message : 'erro desconhecido');
    process.exit(1);
  },
);
