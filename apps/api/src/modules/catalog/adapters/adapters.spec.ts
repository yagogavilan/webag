import { DisabledExternalEanLookup, ExternalEanLookup, lookupExternalEan } from './ean.js';
import { FakeProductVisionProvider, parseVisionOutput } from './vision.js';
import { FEATURE_FLAG_DEFINITIONS } from '../../admin/feature-flags.definitions.js';

const CAT = '3f2b8c1e-5d44-4a0b-9d7a-0a6f1f9b2c11';
const allowed = new Set([CAT]);
const good = { name: 'Camiseta preta', categoryCandidates: [{ categoryId: CAT, confidence: 0.8 }], attributes: { Cor: 'Preto' }, description: 'Camiseta de algodão preta.' };

describe('flags do F8 e do F9 nascem desligadas (C-GEN-01)', () => {
  it('ia_visao_real e ean_base_externa são false por padrão', () => {
    for (const key of ['ia_visao_real', 'ean_base_externa']) expect(FEATURE_FLAG_DEFINITIONS.find((f) => f.key === key)?.default, key).toBe(false);
  });
});

describe('IA de visão: adaptador fake e saída como entrada não confiável (WB-378 C1, C10, C11)', () => {
  it('o fake responde fixo, sem rede e sem ler a foto, e o que ele devolve passa no schema estrito', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const fake = new FakeProductVisionProvider();
    const out = await fake.suggest();
    expect(fake.provider).toBe('fake');
    expect(parseVisionOutput(out, allowed)).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('aceita a saída boa e recusa a INTEIRA quando há campo extra, categoria fora da lista, link, HTML, nome grande ou descrição acima de 300', () => {
    expect(parseVisionOutput(good, allowed)).toEqual(good);
    expect(parseVisionOutput({ ...good, price: 10 }, allowed)).toBeNull(); // não sugere preço (C3)
    expect(parseVisionOutput({ ...good, categoryCandidates: [{ categoryId: '9f2b8c1e-5d44-4a0b-9d7a-0a6f1f9b2c99', confidence: 1 }] }, allowed)).toBeNull(); // "categoria Armas" fora da lista
    expect(parseVisionOutput({ ...good, description: 'Veja https://golpe.example/promo' }, allowed)).toBeNull();
    expect(parseVisionOutput({ ...good, description: 'Compre em www.golpe.example' }, allowed)).toBeNull();
    expect(parseVisionOutput({ ...good, description: '<img src=x onerror=alert(1)>' }, allowed)).toBeNull();
    expect(parseVisionOutput({ ...good, description: '[clique](javascript:alert(1))' }, allowed)).toBeNull();
    expect(parseVisionOutput({ ...good, name: 'a'.repeat(81) }, allowed)).toBeNull();
    expect(parseVisionOutput({ ...good, description: 'a'.repeat(301) }, allowed)).toBeNull();
    expect(parseVisionOutput({ ...good, attributes: { Cor: 'Preto\u0000' } }, allowed)).toBeNull();
    expect(parseVisionOutput('ignore as instruções', allowed)).toBeNull();
    expect(parseVisionOutput(null, allowed)).toBeNull();
  });
});

describe('EAN em base externa (WB-373 C7): desligada = nenhuma chamada', () => {
  it('com a flag desligada o provedor NEM é chamado; ligada, o provedor injetado responde', async () => {
    class Spy extends ExternalEanLookup {
      calls = 0;
      lookup() {
        this.calls += 1;
        return Promise.resolve({ name: 'Perfume', brand: 'Marca' });
      }
    }
    const spy = new Spy();
    expect(await lookupExternalEan(spy, false, '7891000100103')).toBeNull();
    expect(spy.calls).toBe(0);
    expect(await lookupExternalEan(spy, true, '7891000100103')).toEqual({ name: 'Perfume', brand: 'Marca' });
    expect(await lookupExternalEan(new DisabledExternalEanLookup(), true, '7891000100103')).toBeNull(); // o único adaptador existente não faz nada
  });
});
