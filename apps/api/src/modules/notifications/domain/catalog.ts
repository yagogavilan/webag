import type { ExchangeEvent, ExchangeReminder } from '../../exchanges/exchange-events.bus.js';
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
  if (e.notice === 'accept_reminder') return null; // lembrete de aceite é só da loja
  if (e.notice === 'pickup_reminder') {
    const until = e.pickupUntil ? e.pickupUntil.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' às') : 'amanhã';
    return { push: { title: 'Seu pedido espera por você', body: `Retire o pedido ${e.number} até ${until}. Depois disso ele é cancelado e o valor devolvido.`, data } };
  }
  // RN-19 4b/4c: textos neutros (não culpam loja nem motoboy, não admitem culpa jurídica); sem dado pessoal no push.
  if (e.notice === 'late') return { push: { title: 'Seu pedido está demorando mais que o previsto', body: 'Já estamos cuidando disso. Se precisar, fale com a gente.', data } };
  if (e.notice === 'late_compensation') {
    const body = e.compensation?.kind === 'fixed' ? `Pedimos desculpas pelo atraso. Você ganhou R$ ${((e.compensation.valueCents ?? 0) / 100).toFixed(2).replace('.', ',')} de desconto no próximo pedido, válido por 30 dias.` : 'Pedimos desculpas pelo atraso. Você ganhou entrega grátis no seu próximo pedido, válida por 30 dias.';
    return { push: { title: 'Um presente pelo atraso', body, data: { type: 'coupons' } } };
  }
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
  // BUG-017 / HIP-008: lembrete de pedido pago sem aceite (`loja_aceite_lembrete_min`).
  if (e.notice === 'accept_reminder') return { push: { title: 'Pedido esperando aceite', body: `O pedido ${e.number} ainda não foi aceito. Aceite ou recuse antes que ele seja cancelado.`, data: { type: 'store_order', orderId: e.orderId, storeId: e.storeId } } };
  if (e.to !== 'received' || e.from !== 'awaiting_payment') return null;
  return { push: { title: 'Novo pedido', body: `Pedido ${e.number} pago. Aceite em poucos minutos.`, data: { type: 'store_order', orderId: e.orderId, storeId: e.storeId } } };
}

const exchangeWord: Record<string, string> = { withdrawal: 'desistência', defect: 'troca por defeito', size_color: 'troca por tamanho ou cor' };

/** `DD/MM` no fuso de São Paulo (UTC-3, sem horário de verão). */
function formatDayBr(date: Date): string {
  const local = new Date(date.getTime() - 3 * 3_600_000).toISOString();
  return `${local.slice(8, 10)}/${local.slice(5, 7)}`;
}

export function customerExchangeNotice(e: ExchangeEvent): Notice | null {
  const data = { type: 'exchange', exchangeId: e.exchangeId, orderId: e.orderId };
  const what = exchangeWord[e.type] ?? 'troca';
  const reason = e.reason ? ` ${e.reason}.` : '';
  if (e.notice === 'collection_late') {
    // WB-241 C7: coleta atrasada; texto neutro (sem admitir culpa) e com o novo prazo. Data no fuso de São Paulo.
    const until = e.newDeadlineAt ? ` Nova previsão: até ${formatDayBr(e.newDeadlineAt)}.` : '';
    return { push: { title: 'A coleta da sua troca atrasou', body: `A coleta da troca ${e.number} está levando mais tempo que o previsto.${until} Já estamos cuidando disso.`, data } };
  }
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
      // Recusa da loja pode ser contestada; a decisão do admin na mediação é final (WB-176 C5).
      return e.actor === 'admin'
        ? { push: { title: 'Decisão da Webag', body: `Depois da análise, a troca ${e.number} foi recusada.${reason} Você ainda pode procurar um órgão de defesa do consumidor.`, data } }
        : { push: { title: 'Troca recusada', body: `A loja recusou a troca ${e.number}.${reason} Você pode contestar pelo app.`, data } };
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

/** Lembrete do fim do SLA de resposta da troca (DT-050): depois do prazo a troca é aprovada automaticamente. */
export function storeExchangeReminderNotice(r: ExchangeReminder): Notice {
  const what = exchangeWord[r.type] ?? 'troca';
  return { push: { title: `Troca vence em ${r.hoursLeft} h`, body: `Responda a ${what} ${r.number} em até ${r.hoursLeft} horas; depois disso aprovamos automaticamente.`, data: { type: 'store_exchange', exchangeId: r.exchangeId, storeId: r.storeId } } };
}

export function storeExchangeNotice(e: ExchangeEvent): Notice | null {
  const data = { type: 'store_exchange', exchangeId: e.exchangeId, storeId: e.storeId };
  const what = exchangeWord[e.type] ?? 'troca';
  if (e.to === 'requested') return { push: { title: 'Nova solicitação de troca', body: `${what} ${e.number}. Responda em até 24 horas ou aprovamos automaticamente.`, data } };
  if (e.to === 'approved' && e.actor === 'system') return { push: { title: 'Troca aprovada pelo sistema', body: `Troca ${e.number} aprovada. ${e.reason ?? ''}`.trim(), data } };
  return null;
}
