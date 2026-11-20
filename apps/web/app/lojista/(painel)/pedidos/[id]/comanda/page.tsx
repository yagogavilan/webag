import type { Metadata } from 'next';
import { TicketPage } from '@/features/orders/ticket-page';

export const metadata: Metadata = { title: 'Comanda' };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ imprimir?: string }> }) {
  const { id } = await params;
  const { imprimir } = await searchParams;
  return <TicketPage orderId={id} autoPrint={imprimir === '1'} />;
}
