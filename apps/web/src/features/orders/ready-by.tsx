'use client';

import { SolarIcon, cx } from '@/components/ui';
import { formatClock } from '@/lib/format';
import { ltid } from '@/lib/testid';
import s from './orders.module.css';

const T = (id: string) => ltid('orders', id);

/**
 * "Marque 'pronto' até 18:42 para cumprir o prazo" (WB-257 C5, W.8): `readyByAt` = pagamento + preparo da loja, vindo do servidor.
 * É o único prazo que o lojista controla; não mostra a faixa do cliente. Passou do horário: aviso sem ameaça (o cliente não está
 * necessariamente atrasado). Sem `readyByAt` (pedido antigo, sem pagamento ou já pronto) não mostra nada.
 */
export function ReadyBy({ orderId, readyByAt, now }: { orderId: string; readyByAt?: string | null; now: number }) {
  if (!readyByAt) return null;
  const late = now > Date.parse(readyByAt);
  return (
    <p className={cx('wb-text-caption-strong', s.readyBy, late && s.readyByLate)} data-testid={T(`ready-by-${orderId}`)} data-late={late || undefined}>
      <SolarIcon name={late ? 'warning' : 'clock'} size={16} duotone />
      {late ? 'Passou do horário de pronto. Termine assim que puder.' : `Marque “pronto” até ${formatClock(new Date(readyByAt))} para cumprir o prazo.`}
    </p>
  );
}
