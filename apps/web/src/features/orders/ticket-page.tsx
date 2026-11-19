'use client';

import { ArrowLeft, Printer } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { Button, ErrorState, SkeletonRows, cx } from '@/components/ui';
import { useMerchant } from '@/features/lojista/store-context';
import { ordersApi, ordersKeys } from '@/lib/api/orders';
import { ApiError } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format';
import { attributesText } from '@/lib/orders/status';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { OrdersGate } from './orders-gate';
import s from './orders.module.css';

const T = (id: string) => ltid('ticket', id);
type Paper = '80' | 'a4';

/** Comanda para imprimir (WB-071): preto e branco, sem preço; 80 mm (térmica) ou A4. Só o necessário para separar e despachar. */
export function TicketPage({ orderId, autoPrint }: { orderId: string; autoPrint: boolean }) {
  return (
    <OrdersGate>
      {() => (
        <div className={s.page}>
          <Ticket orderId={orderId} autoPrint={autoPrint} />
        </div>
      )}
    </OrdersGate>
  );
}

function Ticket({ orderId, autoPrint }: { orderId: string; autoPrint: boolean }) {
  const { store } = useMerchant();
  const storeId = store.data?.id ?? '';
  const [paper, setPaper] = useState<Paper>('80');
  const query = useQuery({ queryKey: [...ordersKeys.detail(storeId, orderId), 'ticket'], queryFn: () => ordersApi.ticket(storeId, orderId), enabled: Boolean(storeId) });
  const printed = useRef(false);

  useEffect(() => {
    if (autoPrint && query.data && !printed.current) {
      printed.current = true;
      // Deixa a folha desenhar antes de abrir a janela de impressão.
      const timer = setTimeout(() => window.print(), 300);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, query.data]);

  const ticket = query.data;
  const notFound = query.error instanceof ApiError && query.error.status === 404;

  return (
    <>
      <div className={cx(s.noPrint, s.page)}>
        <Link href={asRoute(`/lojista/pedidos/${orderId}`)} className={s.back} data-testid={T('back')}>
          <ArrowLeft size={24} aria-hidden="true" />
          Voltar ao pedido
        </Link>
        <PageHeader title="Comanda" />
        <div className={s.ticketTools}>
          <div role="radiogroup" aria-label="Tamanho do papel" className={s.chipRow}>
            {(['80', 'a4'] as const).map((value) => (
              <button key={value} type="button" role="radio" aria-checked={paper === value} className={cx(s.paperChoice, paper === value && s.paperChoiceOn, 'wb-text-body-strong')} onClick={() => setPaper(value)} data-testid={T(`paper-${value}`)}>
                {value === '80' ? 'Térmica 80 mm' : 'Folha A4'}
              </button>
            ))}
          </div>
          <Button icon={<Printer size={24} aria-hidden="true" />} onClick={() => window.print()} disabled={!ticket} data-testid={T('print')}>
            Imprimir comanda
          </Button>
        </div>
      </div>
      {query.isPending ? (
        <SkeletonRows rows={3} height={80} label="Carregando a comanda" />
      ) : query.isError || !ticket ? (
        notFound ? <p className="wb-text-body" role="alert">Não encontramos esse pedido.</p> : <ErrorState onRetry={() => void query.refetch()} />
      ) : (
        <div className={s.sheetWrap}>
          <article className={cx(s.sheet, paper === '80' ? s.sheet80 : s.sheetA4)} aria-label={`Comanda do pedido ${ticket.number}`} data-testid={T('sheet')}>
            <p className={s.sheetBrand}>WEBAG · PEDIDO</p>
            <p className={s.sheetNumber}>{ticket.number}</p>
            <p className={s.sheetLine}>{formatDateTime(ticket.createdAt)}</p>
            <p className={s.sheetMode}>{ticket.mode === 'delivery' ? 'ENTREGA' : 'RETIRADA'}</p>
            <p className={s.sheetLine}>Cliente: {ticket.customerFirstName}</p>
            <p className={s.sheetLine}>{ticket.mode === 'delivery' ? 'Coleta Webag' : 'Retirada no balcão'}</p>
            <hr className={s.sheetRule} />
            <ul className={s.sheetItems}>
              {ticket.items.map((item, index) => (
                <li key={index} className={s.sheetItem}>
                  {item.quantity}x {item.name}
                  {Object.keys(item.attributes).length > 0 ? <span className={s.sheetItemVar}>{attributesText(item.attributes)}</span> : null}
                </li>
              ))}
            </ul>
            <hr className={s.sheetRule} />
            <p className={s.sheetPaid}>PAGO ONLINE</p>
          </article>
        </div>
      )}
    </>
  );
}
