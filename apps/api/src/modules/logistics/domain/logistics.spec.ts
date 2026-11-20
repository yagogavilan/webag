import { buildCourierMessage, normalizePhone, whatsappLink, type DeliveryMessageData } from './whatsapp.js';
import { canMove, DELIVERY_STATUSES, nextStatuses } from './state.js';

const data: DeliveryMessageData = {
  number: 'WB-4821',
  kind: 'delivery',
  storeName: 'Loja do Zé',
  storePhone: '11 4444-5555',
  pickupAddress: 'Rua A, 10, Centro, Francisco Morato',
  dropoffAddress: 'Rua B, 20, apto 3, Jardim X, Francisco Morato',
  customerFirstName: 'Maria',
  customerPhone: '11 98888-7777',
  volumes: 2,
  note: 'tocar a campainha',
};

describe('estados da corrida (RN-18)', () => {
  it('só avança pelas transições válidas; terminais não saem; reatribuir volta a pronta', () => {
    expect(canMove('ready_for_collection', 'awaiting_courier')).toBe(true);
    expect(canMove('ready_for_collection', 'out_for_delivery')).toBe(false); // não pula o motoboy
    expect(canMove('courier_en_route', 'ready_for_collection')).toBe(true); // reatribuir
    expect(canMove('out_for_delivery', 'ready_for_collection')).toBe(false); // já com o pacote
    expect(canMove('out_for_delivery', 'delivered')).toBe(true);
    expect(canMove('not_delivered', 'out_for_delivery')).toBe(true); // reentrega
    expect(canMove('not_delivered', 'returned_to_store')).toBe(true);
    for (const terminal of ['delivered', 'returned_to_store', 'cancelled'] as const) expect(nextStatuses(terminal)).toEqual([]);
    expect(DELIVERY_STATUSES).toHaveLength(8);
  });
});

describe('mensagem de WhatsApp (WB-232 C5, LGPD)', () => {
  it('segue o modelo do PRD e só leva os campos necessários', () => {
    const text = buildCourierMessage(data);
    expect(text).toBe(
      [
        'Webag - Entrega #WB-4821',
        'COLETA: Loja do Zé, Rua A, 10, Centro, Francisco Morato. Contato da loja: 11 4444-5555',
        'ENTREGA: Rua B, 20, apto 3, Jardim X, Francisco Morato. Cliente: Maria, 11 98888-7777',
        'Volumes: 2. Obs.: tocar a campainha',
        'Pagamento: pago no app. Não cobrar do cliente.',
        'Ao entregar, peça o código de 4 dígitos ao cliente.',
        'Responda OK para confirmar.',
      ].join('\n'),
    );
  });

  it('nunca contém CPF, e-mail, itens, valores nem o código de entrega, mesmo que a observação tente', () => {
    const text = buildCourierMessage({ ...data, note: 'x'.repeat(300) });
    expect(text).not.toMatch(/R\$|cpf|@|código:|\d{3}\.\d{3}\.\d{3}-\d{2}/i);
    expect(text.split('\n')[3]!.length).toBeLessThanOrEqual('Volumes: 2. Obs.: '.length + 100);
    expect(buildCourierMessage({ ...data, note: 'linha 1\nlinha 2' })).toContain('Obs.: linha 1 linha 2'); // sem quebra que injete linhas
  });

  it('coleta de troca usa o modelo próprio; reentrega usa o de entrega com "peça nova"', () => {
    const pickup = buildCourierMessage({ ...data, kind: 'exchange_pickup' });
    expect(pickup).toContain('COLETAR com Maria, Rua B, 20, apto 3, Jardim X, Francisco Morato. Telefone: 11 98888-7777');
    expect(pickup).toContain('LEVAR PARA: Loja do Zé');
    expect(pickup).toContain('Sem cobrança.');
    expect(buildCourierMessage({ ...data, kind: 'exchange_return', note: null })).toContain('Troca: peça nova.');
  });

  it('link wa.me com o texto codificado e telefone normalizado', () => {
    expect(normalizePhone('(11) 98888-7777')).toBe('5511988887777');
    expect(normalizePhone('+55 11 98888-7777')).toBe('5511988887777');
    expect(normalizePhone('11 4444-5555')).toBe('551144445555');
    expect(normalizePhone('98888-7777')).toBeNull(); // sem DDD
    expect(normalizePhone('11 8888-77777')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
    expect(whatsappLink('5511988887777', 'Olá\nOK')).toBe('https://wa.me/5511988887777?text=Ol%C3%A1%0AOK');
  });
});
