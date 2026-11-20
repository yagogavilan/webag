import type { StoreDelivery } from '@webag/shared';
import { t } from '../../i18n';
import { formatDeliveryBack } from './format';

/**
 * Motivo da entrega indisponível (WB-260, DEC-065 F4): `StoreDelivery.unavailableReason` do contrato (`OUT_OF_RANGE` |
 * `LOGISTICS_CLOSED` | `LOGISTICS_PAUSED`, nulo quando entrega). O app só traduz a causa do servidor em texto; não deduz nada
 * de `logisticsClosed` nem do teto da faixa. Sem causa (campo ausente ou valor novo que este app não conhece) diz "Entrega
 * indisponível agora": nunca "fora da área" por omissão (WB-260 C2 e C4). `OUT_OF_RANGE` também cobre a loja que não faz entrega.
 */
export type UnavailableReason = NonNullable<StoreDelivery['unavailableReason']>;

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
  now?: Date;
}

/** O que a API manda de `delivery` (cartão da lista, busca e página da loja). `unavailableReason` aceita texto: valor novo = "indisponível". */
export interface DeliveryLike {
  unavailableReason?: string | null | undefined;
  logisticsOpensAt?: string | null | undefined;
}

export function unavailableKind(d: DeliveryLike): UnavailableKind {
  switch (d.unavailableReason) {
    case 'OUT_OF_RANGE':
      return 'out-of-range';
    case 'LOGISTICS_CLOSED':
      return 'closed';
    case 'LOGISTICS_PAUSED':
      return 'paused';
    default:
      return 'unknown';
  }
}

export function deliveryUnavailable(d: DeliveryLike, opts: UnavailableOptions = {}): DeliveryUnavailable {
  const kind = unavailableKind(d);
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
