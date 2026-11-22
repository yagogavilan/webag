import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch } from '../../../../test/render';
import { fakeStore, renderLojista, storeHandlers } from '../../../../test/lojista';
import { readPasteCopy } from '@/lib/catalog/local-copy';
import { PastePage, type PasteDeps } from './paste-page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => '/lojista/produtos/adicionar-varios' }));
URL.createObjectURL = vi.fn(() => 'blob:preview');

const P = '/api/proxy/lojista/stores/s1';
let drafts = { count: 0, limit: 100 };
let batch: (body: { items: { clientRef: string; name: string }[] }) => Response = (body) =>
  json({ created: body.items.map((item, i) => ({ clientRef: item.clientRef, productId: `p${i + 1}`, missing: ['photo'] })), rejected: [] }, 201);

function setup() {
  return mockFetch(
    (url) => (url.pathname === `${P}/catalog/quick-start` ? json({ suggestedCategoryId: null, draftCount: drafts.count, draftLimit: drafts.limit, latestDraft: null, withoutDescriptionCount: 0, limits: { variantsMax: 100, reajusteMaxPct: 30 } }) : undefined),
    (url, init) => (url.pathname === `${P}/product-drafts/batch` && init.method === 'POST' ? batch(JSON.parse(String(init.body))) : undefined),
    (url, init) => (url.pathname.endsWith('/images') && init.method === 'PUT' ? json({ id: 'x', version: 2 }) : undefined),
    (url, init) => (url.pathname.endsWith('/publish') && init.method === 'POST' ? json({ id: 'x', status: 'active' }) : undefined),
    ...storeHandlers(fakeStore({ status: 'approved', step: 4 })),
  );
}
const deps = (over: Partial<PasteDeps> = {}): PasteDeps => ({ prepare: async () => ({ blob: new Blob(['x'], { type: 'image/jpeg' }) }), upload: async () => ({ assetId: 'asset-1', urls: null }), ...over });
const setOnline = (value: boolean) => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
  act(() => {
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
    onlineManager.setOnline(value);
  });
};
const batchCalls = (calls: { url: URL; init: RequestInit }[]) => calls.filter((c) => c.url.pathname.endsWith('/product-drafts/batch'));
const paste = (text: string) => fireEvent.change(screen.getByTestId('lojista.colar.text'), { target: { value: text } });
async function read(text: string, d: PasteDeps = deps()) {
  renderLojista(<PastePage deps={d} />);
  await screen.findByTestId('lojista.colar.text');
  paste(text);
  await userEvent.click(screen.getByTestId('lojista.colar.read'));
}

beforeEach(() => {
  drafts = { count: 0, limit: 100 };
  batch = (body) => json({ created: body.items.map((item, i) => ({ clientRef: item.clientRef, productId: `p${i + 1}`, missing: ['photo'] })), rejected: [] }, 201);
  localStorage.clear();
  setOnline(true);
});
afterEach(() => vi.unstubAllGlobals());

describe('Adicionar vários: colar e revisar (WB-376)', () => {
  it('C1: "Bermuda jeans M 79,90 4 un" vira nome, tamanho M, preço R$ 79,90 e quantidade 4, e a linha vem "Pronta"', async () => {
    vi.stubGlobal('fetch', setup().impl);
    await read('Bermuda jeans M 79,90 4 un');
    expect(await screen.findByTestId('lojista.colar.name-L1')).toHaveValue('Bermuda jeans');
    expect(screen.getByTestId('lojista.colar.size-L1')).toHaveValue('M');
    expect(screen.getByTestId('lojista.colar.price-L1')).toHaveValue('79,90');
    expect(screen.getByTestId('lojista.colar.qty-L1')).toHaveValue('4');
    expect(screen.getByTestId('lojista.colar.status-L1')).toHaveTextContent('Pronta');
    expect(screen.getByTestId('lojista.colar.summary')).toHaveTextContent('1 linha lida: 1 pronta');
  });

  it('colar vazio e texto sem produto dão a mensagem com exemplo', async () => {
    vi.stubGlobal('fetch', setup().impl);
    renderLojista(<PastePage deps={deps()} />);
    await userEvent.click(await screen.findByTestId('lojista.colar.read'));
    expect(await screen.findByText('Cole a lista primeiro. Cada linha precisa de nome e preço, ex.: Bermuda jeans 79,90.')).toBeInTheDocument();
    paste('---');
    await userEvent.click(screen.getByTestId('lojista.colar.read'));
    expect(await screen.findByText('Não encontramos produtos neste texto. Cada linha precisa de nome e preço, ex.: Bermuda jeans 79,90.')).toBeInTheDocument();
  });

  it('C2: linha sem preço fica "Falta o preço." (campo com erro) e conta como problema; ainda vira rascunho', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    await read('Toalha de banho cinza 4 un\nBermuda jeans M 79,90 4 un');
    expect(await screen.findByText('Falta o preço.')).toBeInTheDocument();
    expect(screen.getByTestId('lojista.colar.price-L1')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('lojista.colar.summary')).toHaveTextContent('2 linhas lidas: 1 pronta, 1 com problema');
    expect(screen.getByTestId('lojista.colar.create')).toHaveTextContent('Criar 2 rascunhos (1 com problema)');
    await userEvent.click(screen.getByTestId('lojista.colar.create'));
    await screen.findByTestId('lojista.colar.photos');
    const sent = JSON.parse(String(batchCalls(calls)[0]?.init.body));
    expect(sent.items[0]).toMatchObject({ clientRef: 'L1', basePriceCents: null });
  });

  it('C3: 101 linhas avisa "Cole até 100 linhas por vez. Você colou 101." e "Usar as 100 primeiras" lê só 100', async () => {
    vi.stubGlobal('fetch', setup().impl);
    await read(Array.from({ length: 101 }, (_, i) => `Item ${i + 1} 10,00`).join('\n'));
    expect(await screen.findByText('Cole até 100 linhas por vez. Você colou 101.')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('lojista.colar.use-first'));
    expect(await screen.findByTestId('lojista.colar.summary')).toHaveTextContent('100 linhas lidas');
  });

  it('C5: 79.90, 79,90 e R$ 79,90 viram o mesmo valor', async () => {
    vi.stubGlobal('fetch', setup().impl);
    await read('Caneca A 79.90\nCaneca B 79,90\nCaneca C R$ 79,90');
    for (const id of ['L1', 'L2', 'L3']) expect(await screen.findByTestId(`lojista.colar.price-${id}`)).toHaveValue('79,90');
  });

  it('C8: fórmula e HTML aparecem como texto puro na tela e no corpo enviado', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    await read('=HYPERLINK("http://x") 10,00\n<script>alert(1)</script> 20,00');
    expect(await screen.findByTestId('lojista.colar.name-L1')).toHaveValue('=HYPERLINK("http://x")');
    expect(screen.getByTestId('lojista.colar.name-L2')).toHaveValue('<script>alert(1)</script>');
    expect(document.querySelector('script:not([src])')?.textContent ?? '').not.toContain('alert(1)');
    await userEvent.click(screen.getByTestId('lojista.colar.create'));
    await screen.findByTestId('lojista.colar.photos');
    expect(JSON.parse(String(batchCalls(calls)[0]?.init.body)).items[1].name).toBe('<script>alert(1)</script>');
  });

  it('C7: nada sai do sistema além da API do Webag (sem IA, sem serviço externo)', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    await read('Bermuda jeans M 79,90 4 un');
    await userEvent.click(await screen.findByTestId('lojista.colar.create'));
    await screen.findByTestId('lojista.colar.photos');
    for (const call of calls) expect(call.url.pathname.startsWith('/api/proxy/lojista/')).toBe(true);
    expect(screen.getByText('Tirar as fotos')).toBeInTheDocument();
  });

  it('C10: P, M e G sugerem juntar 3 linhas; só junta com 1 toque, e o preço por variação some quando é igual', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    await read('Camiseta básica P 49,90\nCamiseta básica M 49,90\nCamiseta básica G 49,90');
    const banner = await screen.findByTestId('lojista.colar.group-1-2-3');
    expect(banner).toHaveTextContent("As linhas 1, 2 e 3 parecem o mesmo produto em tamanhos diferentes. Juntar em 'Camiseta básica' com tamanhos P, M, G?");
    expect(banner).toHaveTextContent('Só juntamos linhas da mesma cor.');
    expect(screen.getAllByTestId(/lojista\.colar\.card-/)).toHaveLength(3);
    await userEvent.click(screen.getByTestId('lojista.colar.merge-1-2-3'));
    expect(screen.getAllByTestId(/lojista\.colar\.card-/)).toHaveLength(1);
    expect(screen.getByTestId('lojista.colar.card-G1')).toHaveTextContent('3 variações');
    await userEvent.click(screen.getByTestId('lojista.colar.create'));
    await screen.findByTestId('lojista.colar.photos');
    const item = JSON.parse(String(batchCalls(calls)[0]?.init.body)).items[0];
    expect(item).toMatchObject({ name: 'Camiseta básica', basePriceCents: 4990, variantAttributes: ['Tamanho'] });
    expect(item.variants.map((v: { attributes: { Tamanho: string } }) => v.attributes.Tamanho)).toEqual(['P', 'M', 'G']);
  });

  it('C10: preços diferentes viram preço por variação', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    await read('Camiseta básica P 49,90\nCamiseta básica M 49,90\nCamiseta básica GG 59,90');
    await userEvent.click(await screen.findByTestId('lojista.colar.merge-1-2-3'));
    expect(screen.getByTestId('lojista.colar.price-G1')).toHaveValue('por variação');
    await userEvent.click(screen.getByTestId('lojista.colar.create'));
    await screen.findByTestId('lojista.colar.photos');
    const variants = JSON.parse(String(batchCalls(calls)[0]?.init.body)).items[0].variants as { priceCents: number | null }[];
    expect(variants.map((v) => v.priceCents)).toEqual([4990, 4990, 5990]);
  });

  it('C10 (DEC-128 #1): cores diferentes NÃO sugerem juntar; a mesma cor sugere, com a cor no nome', async () => {
    vi.stubGlobal('fetch', setup().impl);
    await read('Camiseta básica preta P 49,90\nCamiseta básica branca P 49,90');
    await screen.findByTestId('lojista.colar.card-L1');
    expect(screen.queryByTestId(/lojista\.colar\.group-/)).not.toBeInTheDocument();
    expect(screen.getByText('Cor sugerida: preta. Dá para ajustar na grade depois.')).toBeInTheDocument();
  });

  it('C10: "Manter separados" some com a sugestão e não junta', async () => {
    vi.stubGlobal('fetch', setup().impl);
    await read('Camiseta básica preta P 49,90\nCamiseta básica preta M 49,90');
    expect(await screen.findByTestId('lojista.colar.group-1-2')).toHaveTextContent("Juntar em 'Camiseta básica preta' com tamanhos P, M?");
    await userEvent.click(screen.getByRole('button', { name: 'Manter separados' }));
    expect(screen.queryByTestId('lojista.colar.group-1-2')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/lojista\.colar\.card-/)).toHaveLength(2);
  });

  it('C11/C14: "Mais de um preço" oferece "Separar em 2 linhas"; o estoque vai só para a última, com aviso, e as duas ficam "Confira"', async () => {
    vi.stubGlobal('fetch', setup().impl);
    await read('Bermuda P 49,90 G 59,90 4 un');
    expect(await screen.findByTestId('lojista.colar.status-L1')).toHaveTextContent('Mais de um preço');
    await userEvent.click(screen.getByRole('button', { name: 'Separar em 2 linhas' }));
    expect(screen.getAllByTestId(/lojista\.colar\.card-/)).toHaveLength(2);
    expect(screen.getByTestId('lojista.colar.qty-L1.1')).toHaveValue('1');
    expect(screen.getByTestId('lojista.colar.qty-L1.2')).toHaveValue('4');
    expect(screen.getByTestId('lojista.colar.price-L1.2')).toHaveValue('59,90');
    expect(screen.getAllByText('O estoque 4 ficou na última linha. Confira o estoque de cada uma.')).toHaveLength(2);
    expect(screen.getByTestId('lojista.colar.status-L1.1')).toHaveTextContent('Confira');
    await userEvent.click(screen.getByTestId('lojista.colar.ok-L1.1-stock'));
    await userEvent.click(screen.getByTestId('lojista.colar.ok-L1.2-stock'));
    expect(screen.getByTestId('lojista.colar.status-L1.1')).toHaveTextContent('Pronta');
  });

  it('C12: linha de 230 caracteres é cortada com aviso, o preço fica "Confira" e o item nunca sai "Pronta" até o [Conferi]', async () => {
    vi.stubGlobal('fetch', setup().impl);
    const head = `${'Camiseta '.repeat(20)}abcdefg hijklmn `;
    await read(`${head}R$ 1.299,90\nBermuda jeans M 79,90 4 un`);
    expect(await screen.findByText('Linha cortada em 200 caracteres: confira o nome e o preço.')).toBeInTheDocument();
    expect(screen.getByText('Confira o preço: a linha foi cortada.')).toBeInTheDocument();
    expect(screen.getByTestId('lojista.colar.status-L1')).toHaveTextContent('Confira');
    expect(screen.getByTestId('lojista.colar.status-L2')).toHaveTextContent('Pronta');
    expect(screen.getByTestId('lojista.colar.summary')).toHaveTextContent('2 linhas lidas: 1 pronta, 1 para conferir');
    await userEvent.click(screen.getByTestId('lojista.colar.ok-L1-truncated'));
    expect(screen.getByTestId('lojista.colar.status-L1')).toHaveTextContent('Confira');
    await userEvent.click(screen.getByTestId('lojista.colar.ok-L1-price'));
    expect(screen.getByTestId('lojista.colar.status-L1')).toHaveTextContent('Pronta');
  });

  it('C13: "Camisa Brasil nº 10 129,90" lê 10 como tamanho com "Confira"; "Não é tamanho" devolve o número ao nome', async () => {
    vi.stubGlobal('fetch', setup().impl);
    await read('Camisa Brasil nº 10 129,90');
    expect(await screen.findByText('Lemos 10 como tamanho. Está certo?')).toBeInTheDocument();
    expect(screen.getByTestId('lojista.colar.size-L1')).toHaveValue('10');
    expect(screen.getByTestId('lojista.colar.status-L1')).toHaveTextContent('Confira');
    await userEvent.click(screen.getByTestId('lojista.colar.reject-L1-size'));
    expect(screen.getByTestId('lojista.colar.name-L1')).toHaveValue('Camisa Brasil 10');
    expect(screen.getByTestId('lojista.colar.size-L1')).toHaveValue('');
    expect(screen.getByTestId('lojista.colar.status-L1')).toHaveTextContent('Pronta');
  });

  it('C13: "tam 61" não vira tamanho e "Calça jeans 52" (sem marcador) também não', async () => {
    vi.stubGlobal('fetch', setup().impl);
    await read('Calça jeans tam 61 99,90\nCalça jeans 52 99,90');
    expect(await screen.findByTestId('lojista.colar.size-L1')).toHaveValue('');
    expect(screen.getByTestId('lojista.colar.size-L2')).toHaveValue('');
    expect((screen.getByTestId('lojista.colar.name-L1') as HTMLInputElement).value).toContain('61');
  });

  it('calçado: o marcador "É uma lista de calçados" lê 42 como tamanho, com Confira', async () => {
    vi.stubGlobal('fetch', setup().impl);
    renderLojista(<PastePage deps={deps()} />);
    await screen.findByTestId('lojista.colar.text');
    paste('Tênis 42 199,90 2 un');
    await userEvent.click(screen.getByTestId('lojista.colar.footwear'));
    await userEvent.click(screen.getByTestId('lojista.colar.read'));
    expect(await screen.findByText('Lemos 42 como tamanho. Está certo?')).toBeInTheDocument();
  });
});

describe('Vagas de rascunho e sem rede (WB-376 C15, DEC-126)', () => {
  it('80 rascunhos e 30 linhas: nada é criado em silêncio; mostra "Você tem espaço para 20 rascunhos" e "Criar só os 20 primeiros" (outra chave)', async () => {
    drafts = { count: 80, limit: 100 };
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    await read(Array.from({ length: 30 }, (_, i) => `Item ${i + 1} 10,00`).join('\n'));
    await userEvent.click(await screen.findByTestId('lojista.colar.create'));
    expect(await screen.findByText('Você tem espaço para 20 rascunhos.')).toBeInTheDocument();
    expect(batchCalls(calls)).toHaveLength(0);
    await userEvent.click(screen.getByTestId('lojista.colar.create-first'));
    await screen.findByTestId('lojista.colar.photos');
    const sent = batchCalls(calls);
    expect(sent).toHaveLength(1);
    expect(JSON.parse(String(sent[0]?.init.body)).items).toHaveLength(20);
  });

  it('100 rascunhos: "Limite de 100 rascunhos. Publique ou apague algum." e nada é criado', async () => {
    drafts = { count: 100, limit: 100 };
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    await read('Bermuda jeans M 79,90 4 un');
    await userEvent.click(await screen.findByTestId('lojista.colar.create'));
    expect(await screen.findByText('Limite de 100 rascunhos. Publique ou apague algum.')).toBeInTheDocument();
    expect(screen.queryByTestId('lojista.colar.create-first')).not.toBeInTheDocument();
    expect(batchCalls(calls)).toHaveLength(0);
  });

  it('o servidor recusa por limite (corrida): usa as vagas que ele informa', async () => {
    batch = () => json({ code: 'DRAFT_LIMIT_REACHED', title: 'Limite', status: 422, slotsAvailable: 1, draftCount: 99, limit: 100 }, 422);
    vi.stubGlobal('fetch', setup().impl);
    await read('A 10,00\nB 20,00');
    await userEvent.click(await screen.findByTestId('lojista.colar.create'));
    expect(await screen.findByText('Você tem espaço para 1 rascunho.')).toBeInTheDocument();
  });

  it('sem internet: a leitura funciona, "Criar rascunhos" fica inerte com o motivo e o texto fica no aparelho por 24 h; nada é enviado sozinho', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    await read('Bermuda jeans M 79,90 4 un');
    await screen.findByTestId('lojista.colar.review');
    setOnline(false);
    const create = screen.getByTestId('lojista.colar.create');
    expect(create).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('lojista.colar.offline')).toHaveTextContent('Sem internet. Conecte para criar os rascunhos. Seu texto continua aqui. Volte quando tiver internet.');
    await userEvent.click(create);
    expect(await screen.findByTestId('lojista.colar.note')).toHaveTextContent('Sem internet. Conecte para criar os rascunhos.');
    expect(batchCalls(calls)).toHaveLength(0);
    await waitFor(() => expect(readPasteCopy('u1', 's1')).toBe('Bermuda jeans M 79,90 4 un'));
    setOnline(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(batchCalls(calls)).toHaveLength(0);
  });

  it('o texto colado volta depois de recarregar a tela', async () => {
    vi.stubGlobal('fetch', setup().impl);
    const first = renderLojista(<PastePage deps={deps()} />);
    await screen.findByTestId('lojista.colar.text');
    paste('Bermuda jeans M 79,90 4 un');
    await waitFor(() => expect(readPasteCopy('u1', 's1')).not.toBeNull());
    first.result.unmount();
    renderLojista(<PastePage deps={deps()} />);
    expect(await screen.findByTestId('lojista.colar.text')).toHaveValue('Bermuda jeans M 79,90 4 un');
    expect(screen.getByTestId('lojista.colar.restored')).toBeInTheDocument();
  });

  it('falha ao criar mostra a mensagem e a lista continua guardada; repetir usa a mesma chave', async () => {
    let calls = 0;
    batch = (body) => (++calls === 1 ? json({ code: 'INTERNAL', title: 'x', status: 500 }, 500) : json({ created: body.items.map((i, n) => ({ clientRef: i.clientRef, productId: `p${n}`, missing: ['photo'] })), rejected: [] }, 201));
    const { impl, calls: all } = setup();
    vi.stubGlobal('fetch', impl);
    await read('Bermuda jeans M 79,90 4 un');
    await userEvent.click(await screen.findByTestId('lojista.colar.create'));
    expect((await screen.findByTestId('lojista.colar.note')).textContent).toContain('Não conseguimos criar os rascunhos agora');
    await userEvent.click(screen.getByTestId('lojista.colar.create'));
    await screen.findByTestId('lojista.colar.photos');
    const keys = batchCalls(all).map((c) => (c.init.headers as Record<string, string>)['idempotency-key']);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });
});

describe('Etapa de fotos (WB-376 C4)', () => {
  it('cria os rascunhos, mostra "0 de N com foto"; cada foto sobe a contagem; "Publicar os válidos (n)" publica só os com foto', async () => {
    const { impl, calls } = setup();
    vi.stubGlobal('fetch', impl);
    await read('Bermuda jeans M 79,90 4 un\nCamiseta básica P 49,90');
    await userEvent.click(await screen.findByTestId('lojista.colar.create'));
    expect(await screen.findByTestId('lojista.colar.photos-count')).toHaveTextContent('0 de 2 com foto');
    expect(screen.getByTestId('lojista.colar.publish-valid')).toHaveTextContent('Publicar os válidos (0)');
    await userEvent.click(screen.getByTestId('lojista.colar.publish-valid'));
    expect(await screen.findByTestId('lojista.colar.photos-note')).toHaveTextContent('Nenhum produto pronto. Tire as fotos primeiro.');
    await userEvent.click(screen.getByTestId('lojista.colar.photo-p1'));
    fireEvent.change(screen.getByTestId('lojista.colar.file'), { target: { files: [new File([new Uint8Array(10)], 'f.jpg', { type: 'image/jpeg' })] } });
    await waitFor(() => expect(screen.getByTestId('lojista.colar.photos-count')).toHaveTextContent('1 de 2 com foto'));
    expect(screen.getByTestId('lojista.colar.item-status-p1')).toHaveTextContent('Pronta');
    expect(screen.getByTestId('lojista.colar.item-status-p2')).toHaveTextContent('Falta a foto');
    expect(screen.getByTestId('lojista.colar.publish-valid')).toHaveTextContent('Publicar os válidos (1)');
    await userEvent.click(screen.getByTestId('lojista.colar.publish-valid'));
    await waitFor(() => expect(screen.getByTestId('lojista.colar.item-status-p1')).toHaveTextContent('Publicado'));
    expect(calls.filter((c) => c.url.pathname.endsWith('/publish'))).toHaveLength(1);
    expect(calls.find((c) => c.url.pathname.endsWith('/p1/images'))).toBeDefined();
    expect(within(screen.getByTestId('lojista.colar.item-p2')).queryByText('Publicado')).not.toBeInTheDocument();
  });

  it('linha recusada pelo servidor aparece com o motivo, sem esconder as criadas', async () => {
    batch = (body) => json({ created: [{ clientRef: body.items[0]?.clientRef, productId: 'p1', missing: ['photo'] }], rejected: [{ clientRef: body.items[1]?.clientRef, code: 'CATEGORY_FORBIDDEN', message: 'Categoria não permitida' }] }, 201);
    vi.stubGlobal('fetch', setup().impl);
    await read('A 10,00\nB 20,00');
    await userEvent.click(await screen.findByTestId('lojista.colar.create'));
    expect(await screen.findByTestId('lojista.colar.rejected')).toHaveTextContent('1 linha não foi criada: linha 2 (Categoria não permitida)');
    expect(screen.getByTestId('lojista.colar.photos-count')).toHaveTextContent('0 de 1 com foto');
  });
});
