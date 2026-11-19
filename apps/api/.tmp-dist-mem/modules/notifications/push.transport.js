var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var PushTransport_1;
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { safeErrorMessage } from '../../platform/logging/mask.js';
const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
/** O Expo aceita até 100 mensagens por requisição. */
const CHUNK = 100;
/**
 * Entrega de push. `log` (padrão) só guarda em memória e registra sem o corpo (dev, teste e ambiente sem credencial); `expo` envia
 * pelo Expo Push Service (FCM v1 e APNs ficam no EAS: credenciais do fundador). Falha do provedor nunca derruba o fluxo do pedido.
 */
let PushTransport = PushTransport_1 = class PushTransport {
    config;
    logger = new Logger(PushTransport_1.name);
    /** Só no modo `log`: o que seria enviado (teste e depuração). */
    sent = [];
    constructor(config) {
        this.config = config;
    }
    get mode() {
        return this.config.get('PUSH_PROVIDER', { infer: true });
    }
    async send(messages) {
        if (messages.length === 0)
            return [];
        if (this.mode === 'log') {
            this.sent.push(...messages);
            if (this.sent.length > 500)
                this.sent.splice(0, this.sent.length - 500);
            this.logger.debug(`push (log): ${messages.length} mensagem(ns)`);
            return messages.map(() => ({ ok: true, invalidToken: false }));
        }
        const results = [];
        for (let i = 0; i < messages.length; i += CHUNK)
            results.push(...(await this.sendChunk(messages.slice(i, i + CHUNK))));
        return results;
    }
    async sendChunk(chunk) {
        const token = this.config.get('EXPO_ACCESS_TOKEN', { infer: true });
        try {
            const res = await fetch(EXPO_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify(chunk.map((m) => ({ to: m.to, title: m.title, body: m.body, data: m.data, sound: 'default', priority: 'high', channelId: 'default' }))),
                signal: AbortSignal.timeout(8_000),
            });
            if (!res.ok)
                throw new Error(`Expo respondeu ${res.status}`);
            const json = (await res.json());
            return chunk.map((_, index) => {
                const ticket = json.data?.[index];
                return { ok: ticket?.status === 'ok', invalidToken: ticket?.details?.error === 'DeviceNotRegistered' };
            });
        }
        catch (error) {
            this.logger.warn(`falha ao enviar push: ${safeErrorMessage(error)}`);
            return chunk.map(() => ({ ok: false, invalidToken: false }));
        }
    }
};
PushTransport = PushTransport_1 = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [ConfigService])
], PushTransport);
export { PushTransport };
//# sourceMappingURL=push.transport.js.map