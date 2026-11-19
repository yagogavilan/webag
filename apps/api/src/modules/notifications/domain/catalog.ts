import type { ExchangeEvent } from '../../exchanges/exchange-events.bus.js';
import type { OrderEvent } from '../../orders/order-events.bus.js';

export interface Notice {
  push?: { title: string; body: string; data: Record<string, string> };
  email?: { subject: string; text: string };
}

/**
 * Catálogo de mensagens transacionais (PRD notificacoes.md): o texto sai daqui, nunca montado em outro lugar. Push não leva dado
 * pessoal (nem endereço, nem código de retirada): o código aparece no app. Sem emoji.
 */
const closing = (e: OrderEvent): string => (e.reason ? ` Motivo: ${e.reason}.` : '');

export function customerOrderNotice(e: OrderEvent, storeName: string): Notice | null {
  const data = { type: 'order', orderId: e.orderId };
  if (e.delivery?.status === 'not_delivered') {
    return {
      push: { title: 'Não conseguimos entregar', body: `Pedido ${e.number}: combine uma nova tentativa pelo app.`, data },
      email: { subject: `Não conseguimos entregar o pedido ${e.number}`, text: `Não conseguimos entregar o pedido ${e.number}.${closing(e)}\nAbra o app para combinar uma nova tentativa.` },
    };
  }
  if (e.delivery) return null; // demais mudanças da corrida aparecem só no acompanhamento (in-app, sem push)
  switch (e.to) {
    case 'received':
      return {
        push: { title: 'Pedido recebido', body: `Pedido ${e.number} recebido. A loja já foi avisada.`, data },
        email: { subject: `Pedido ${e.number} recebido`, text: `Recebemos o pagamento do pedido ${e.number} e avisamos ${storeName}. Você acompanha tudo pelo app.` },
      };
    case 'accepted':
      return { push: { title: 'Pedido aceito', body: `${storeName} aceitou o pedido ${e.number}.`, data } };
    case 'out_for_delivery':
      return { push: { title: 'Saiu para entrega', body: `Seu pedido ${e.number} saiu para entrega.`, data } };
    case 'ready_for_pickup':
      return { push: { title: 'Pronto para retirar', body: `Pedido ${e.number} pronto. Mostre o código no app.`, data } };
    case 'delivered':
      return { push: { title: 'Pedido entregue', body: `Pedido ${e.number} entregue.`, data } };
    case 'cancelled':
    case 'refused':
    case 'expired': {
      const word = e.to === 'cancelled' ? 'cancelado' : e.to === 'refused' ? 'recusado pela loja' : 'expirado';
      return {
        push: { title: `Pedido ${word}`, body: `Pedido ${e.number} ${word}.${closing(e)} Se houve pagamento, o estorno foi iniciado.`, data },
        email: { subject: `Pedido ${e.number} ${word}`, text: `O pedido ${e.number} foi ${word}.${closing(e)}\nSe houve pagamento, o estorno foi iniciado e volta pela mesma forma de pagamento.` },
      };
    }
    default:
      return null;
  }
}

/** Alerta ao lojista de pedido novo (a venda se perde se ninguém vê em 10 min). */
export function storeOrderNotice(e: OrderEvent): Notice | null {
  if (e.to !== 'received' || e.from !== 'awaiting_payment') return null;
  return { push: { title: 'Novo pedido', body: `Pedido ${e.number} pago. Aceite em poucos minutos.`, data: { type: 'store_order', orderId: e.orderId, storeId: e.storeId } } };
}

const exchangeWord: Record<string, string> = { withdrawal: 'desistência', defect: 'troca por defeito', size_color: 'troca por tamanho ou cor' };

export function customerExchangeNotice(e: ExchangeEvent): Notice | null {
  const data = { type: 'exchange', exchangeId: e.exchangeId, orderId: e.orderId };
  const what = exchangeWord[e.type] ?? 'troca';
  const reason = e.reason ? ` ${e.reason}.` : '';
  switch (e.to) {
    case 'requested':
      // Confirmação imediata do pedido de desistência com protocolo (Decreto 7.962/2013, WB-178 C7).
      return {
        push: { title: 'Pedido recebido', body: `Recebemos seu pedido de ${what}. Protocolo ${e.number}.`, data },
        email: { subject: `Pedido de ${what} recebido (${e.number})`, text: `Recebemos seu pedido de ${what}. Protocolo: ${e.number}.\nAcompanhe pelo app. A loja responde em até 24 horas; se não responder, aprovamos.` },
      };
    case 'awaiting_fee':
      return { push: { title: 'Troca aprovada', body: `Troca ${e.number} aprovada. Pague a taxa de coleta para liberar a busca.`, data } };
    case 'approved':
      return { push: { title: 'Troca aprovada', body: `Troca ${e.number} aprovada. Veja o próximo passo no app.`, data } };
    case 'rejected':
      return { push: { title: 'Troca recusada', body: `A loja recusou a troca ${e.number}.${reason} Você pode contestar pelo app.`, data } };
    case 'in_mediation':
      return { push: { title: 'Troca em análise', body: `A troca ${e.number} está em análise pela Webag.`, data } };
    case 'item_received':
      return { push: { title: 'Item conferido', body: `A loja conferiu o item da troca ${e.number}. A peça nova vai para entrega.`, data } };
    case 'completed':
      return { push: { title: 'Troca concluída', body: `Troca ${e.number} concluída.`, data } };
    case 'cancelled':
    case 'expired':
      return { push: { title: e.to === 'cancelled' ? 'Troca cancelada' : 'Troca expirada', body: `Troca ${e.number}.${reason}`.trim(), data } };
    default:
      return null;
  }
}

export function storeExchangeNotice(e: ExchangeEvent): Notice | null {
  const data = { type: 'store_exchange', exchangeId: e.exchangeId, storeId: e.storeId };
  const what = exchangeWord[e.type] ?? 'troca';
  if (e.to === 'requested') return { push: { title: 'Nova solicitação de troca', body: `${what} ${e.number}. Responda em até 24 horas ou aprovamos automaticamente.`, data } };
  if (e.to === 'approved' && e.actor === 'system') return { push: { title: 'Troca aprovada pelo sistema', body: `Troca ${e.number} aprovada. ${e.reason ?? ''}`.trim(), data } };
  return null;
}
