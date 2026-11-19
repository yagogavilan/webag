import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../platform/config/env.js';
import { safeErrorMessage } from '../../platform/logging/mask.js';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
}
/** `invalidToken`: o provedor disse que o aparelho não existe mais (`DeviceNotRegistered`): o token é desligado. */
export interface PushResult {
  ok: boolean;
  invalidToken: boolean;
}

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
/** O Expo aceita até 100 mensagens por requisição. */
const CHUNK = 100;

/**
 * Entrega de push. `log` (padrão) só guarda em memória e registra sem o corpo (dev, teste e ambiente sem credencial); `expo` envia
 * pelo Expo Push Service (FCM v1 e APNs ficam no EAS: credenciais do fundador). Falha do provedor nunca derruba o fluxo do pedido.
 */
@Injectable()
export class PushTransport {
  private readonly logger = new Logger(PushTransport.name);
  /** Só no modo `log`: o que seria enviado (teste e depuração). */
  readonly sent: PushMessage[] = [];

  constructor(private readonly config: ConfigService<Env, true>) {}

  get mode(): 'log' | 'expo' {
    return this.config.get('PUSH_PROVIDER', { infer: true });
  }

  async send(messages: PushMessage[]): Promise<PushResult[]> {
    if (messages.length === 0) return [];
    if (this.mode === 'log') {
      this.sent.push(...messages);
      if (this.sent.length > 500) this.sent.splice(0, this.sent.length - 500);
      this.logger.debug(`push (log): ${messages.length} mensagem(ns)`);
      return messages.map(() => ({ ok: true, invalidToken: false }));
    }
    const results: PushResult[] = [];
    for (let i = 0; i < messages.length; i += CHUNK) results.push(...(await this.sendChunk(messages.slice(i, i + CHUNK))));
    return results;
  }

  private async sendChunk(chunk: PushMessage[]): Promise<PushResult[]> {
    const token = this.config.get('EXPO_ACCESS_TOKEN', { infer: true });
    try {
      const res = await fetch(EXPO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(chunk.map((m) => ({ to: m.to, title: m.title, body: m.body, data: m.data, sound: 'default', priority: 'high', channelId: 'default' }))),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`Expo respondeu ${res.status}`);
      const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      return chunk.map((_, index) => {
        const ticket = json.data?.[index];
        return { ok: ticket?.status === 'ok', invalidToken: ticket?.details?.error === 'DeviceNotRegistered' };
      });
    } catch (error) {
      this.logger.warn(`falha ao enviar push: ${safeErrorMessage(error)}`);
      return chunk.map(() => ({ ok: false, invalidToken: false }));
    }
  }
}
