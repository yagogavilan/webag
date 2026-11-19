var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var MailService_1;
import { safeErrorMessage } from '../logging/mask.js';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
/**
 * Envio de e-mail por SMTP (Mailpit no dev; nunca chega a endereço real fora de produção por construção:
 * o SMTP de dev é o Mailpit). WB-194 C2: falha do SMTP não bloqueia o fluxo; retenta com espera crescente (até 5x).
 */
let MailService = MailService_1 = class MailService {
    logger = new Logger(MailService_1.name);
    transporter;
    from;
    inflight = new Set();
    retryDelaysMs = [1_000, 4_000, 15_000, 60_000, 300_000];
    constructor(config) {
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
    enqueue(message) {
        const sending = this.sendWithRetry(message, 0).finally(() => this.inflight.delete(sending));
        this.inflight.add(sending);
    }
    /** Espera os envios em andamento (a CLI termina o processo logo depois; sem isto os e-mails se perdem). */
    async flush(timeoutMs = 15_000) {
        await Promise.race([Promise.allSettled([...this.inflight]), new Promise((resolve) => setTimeout(resolve, timeoutMs).unref())]);
    }
    /** Envio direto, com um erro propagado. Útil em jobs e testes. */
    async sendNow(message) {
        await this.transporter.sendMail({ from: this.from, ...message });
    }
    async sendWithRetry(message, attempt) {
        try {
            await this.sendNow(message);
        }
        catch (error) {
            const delay = this.retryDelaysMs[attempt];
            // Não loga destinatário nem conteúdo (pode ter código).
            this.logger.warn(`Falha ao enviar e-mail (tentativa ${attempt + 1}): ${safeErrorMessage(error)}`);
            if (delay === undefined)
                return;
            setTimeout(() => void this.sendWithRetry(message, attempt + 1), delay).unref();
        }
    }
};
MailService = MailService_1 = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [ConfigService])
], MailService);
export { MailService };
//# sourceMappingURL=mail.service.js.map