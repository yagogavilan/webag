import { z } from 'zod';
import { t } from '../../i18n';
import { MAX_ETA_MINUTES } from './eta';
import { formatDeliveryBack } from './format';

/**
 * Motivo da entrega indisponível (WB-260, DEC-065 F4). O contrato PROPOSTO traz `unavailableReason` em `StoreDelivery`
 * (`OUT_OF_RANGE` | `LOGISTICS_CLOSED` | `LOGISTICS_PAUSED`); enquanto o backend não entrega, o campo não existe e o app infere SÓ do que já
 * vem (`logisticsClosed`, `logisticsOpensAt`, teto da faixa). Sem causa conhecida diz "Entrega indisponível agora": nunca "fora da área"
 * por omissão (WB-260 C2 e C4). Quando o campo chegar, ele passa a mandar e nada mais muda na tela.
 */
export type UnavailableReason = 'OUT_OF_RANGE' | 'LOGISTICS_CLOSED' | 'LOGISTICS_PAUSED';
const reasonSchema = z.enum(['OUT_OF_RANGE', 'LOGISTICS_CLOSED', 'LOGISTICS_PAUSED']);

/** Lê `unavailableReason` de qualquer objeto da API, sem depender de o tipo gerado já ter o campo; valor desconhecido vira `null`. */
export function readUnavailableReason(source: unknown): UnavailableReason | null {
  const raw = (source as { unavailableReason?: unknown } | null | undefined)?.unavailableReason;
  const parsed = reasonSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export interface DeliveryLike {
  available?: boolean | null | undefined;
  etaMaxMinutes?: number | undefined;
  logisticsClosed?: boolean | undefined;
  logisticsOpensAt?: string | null | undefined;
}

export type UnavailableKind = 'out-of-range' | 'closed' | 'paused' | 'unknown';

export interface DeliveryUnavailable {
  kind: UnavailableKind;
  /** Texto curto do chip do cartão. */
  chip: string;
  /** Frase da loja e do aviso (sem ponto final). */
  title: string;
  /** Complemento ("Você pode retirar na loja."), quando faz sentido. */
  sub: string | null;
  /** Hora falada da volta ("amanhã às 9h"), se a API deu. */
  back: string | null;
}

export interface UnavailableOptions {
  /**
   * A tela recebe o estado da logística (`logisticsClosed`) junto com a loja (a tela da loja recebe; o cartão da lista não). Então
   * `available=false` sem logística fechada só pode ser distância. Sem isto, a causa desconhecida é "Entrega indisponível agora".
   */
  logisticsKnown?: boolean;
  now?: Date;
}

export function unavailableKind(d: DeliveryLike & { unavailableReason?: unknown }, opts: UnavailableOptions = {}): UnavailableKind {
  const reason = readUnavailableReason(d);
  if (reason === 'OUT_OF_RANGE') return 'out-of-range';
  if (reason === 'LOGISTICS_CLOSED') return 'closed';
  if (reason === 'LOGISTICS_PAUSED') return 'paused';
  if (d.logisticsClosed || d.logisticsOpensAt) return d.logisticsOpensAt ? 'closed' : 'paused';
  if (typeof d.etaMaxMinutes === 'number' && d.etaMaxMinutes > MAX_ETA_MINUTES) return 'out-of-range';
  if (opts.logisticsKnown && d.available === false) return 'out-of-range';
  return 'unknown';
}

export function deliveryUnavailable(d: DeliveryLike & { unavailableReason?: unknown }, opts: UnavailableOptions = {}): DeliveryUnavailable {
  const kind = unavailableKind(d, opts);
  const back = formatDeliveryBack(d.logisticsOpensAt, opts.now);
  switch (kind) {
    case 'out-of-range':
      return { kind, chip: t('ops.outOfRangeChip'), title: t('ops.outOfRange'), sub: null, back: null };
    case 'closed':
      return back
        ? { kind, chip: t('ops.chipBack', { when: back }), title: t('ops.back', { when: back }), sub: t('ops.backSub'), back }
        : { kind, chip: t('ops.closedChip'), title: t('ops.closedTitle'), sub: t('ops.backSub'), back: null };
    case 'paused':
      return back
        ? { kind, chip: t('ops.chipBack', { when: back }), title: t('ops.pausedBack', { when: back }), sub: t('ops.backSub'), back }
        : { kind, chip: t('ops.chipPaused'), title: t('ops.paused'), sub: t('ops.pausedSub'), back: null };
    case 'unknown':
      return { kind, chip: t('ops.unknownChip'), title: t('ops.unknown'), sub: null, back: null };
  }
}
