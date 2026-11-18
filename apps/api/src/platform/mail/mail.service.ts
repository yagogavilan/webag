import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from '../config/env.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Envio de e-mail por SMTP (Mailpit no dev; nunca chega a endereço real fora de produção por construção:
 * o SMTP de dev é o Mailpit). WB-194 C2: falha do SMTP não bloqueia o fluxo; retenta com espera crescente (até 5x).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly inflight = new Set<Promise<void>>();
  protected retryDelaysMs = [1_000, 4_000, 15_000, 60_000, 300_000];

  constructor(config: ConfigService<Env, true>) {
    this.from = config.get('SMTP_FROM', { infer: true });
    const user = config.get('SMTP_USER', { infer: true });
    this.transporter = nodemailer.createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      secure: false,
      auth: user ? { user, pass: config.get('SMTP_PASSWORD', { infer: true }) } : undefined,
    });
  }

  /** Dispara sem esperar (resposta da API não depende do SMTP, SEC-003 tempo igual). Nunca lança. */
  enqueue(message: MailMessage): void {
    const sending = this.sendWithRetry(message, 0).finally(() => this.inflight.delete(sending));
    this.inflight.add(sending);
  }

  /** Espera os envios em andamento (a CLI termina o processo logo depois; sem isto os e-mails se perdem). */
  async flush(timeoutMs = 15_000): Promise<void> {
    await Promise.race([Promise.allSettled([...this.inflight]), new Promise((resolve) => setTimeout(resolve, timeoutMs).unref())]);
  }

  /** Envio direto, com um erro propagado. Útil em jobs e testes. */
  async sendNow(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }

  protected async sendWithRetry(message: MailMessage, attempt: number): Promise<void> {
    try {
      await this.sendNow(message);
    } catch (error) {
      const delay = this.retryDelaysMs[attempt];
      // Não loga destinatário nem conteúdo (pode ter código).
      this.logger.warn(`Falha ao enviar e-mail (tentativa ${attempt + 1}): ${(error as Error).message}`);
      if (delay === undefined) return;
      setTimeout(() => void this.sendWithRetry(message, attempt + 1), delay).unref();
    }
  }
}
