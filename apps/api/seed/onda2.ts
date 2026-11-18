import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { PasswordService } from '../src/modules/identity/password.service.js';
import { renderVariant } from '../src/modules/media/image.processor.js';
import type { Db } from '../src/platform/database/database.module.js';
import type { ObjectStorage } from '../src/platform/storage/object-storage.js';
import {
  categories,
  cities,
  legalDocuments,
  mediaAssets,
  paymentAccounts,
  productImages,
  products,
  productVariants,
  storeDeliveryTiers,
  storeHours,
  storeMembers,
  storeSections,
  storeSettings,
  stores,
  termsAcceptances,
  userRoles,
  users,
} from '../src/platform/database/schema.js';

/**
 * Seed da Onda 2: 7 lojas FICTÍCIAS em bairros reais de Francisco Morato e Franco da Rocha, com produtos, variações,
 * estoque, promoções, seções e fotos. Idempotente (identifica a loja pelo e-mail do dono) e só roda em desenvolvimento
 * (nunca em produção: DEC-030d).
 *
 * FONTE DOS DADOS (registro de origem):
 * - Nomes de lojas, donos, produtos, preços, estoques e endereços: inventados para teste. Nenhuma pessoa, empresa ou
 *   marca real; qualquer coincidência é acaso. Os e-mails usam o domínio reservado `seed.webag.local`.
 * - Bairros e cidades: nomes reais (os mesmos do seed da Onda 1). As coordenadas são APROXIMADAS do centro de cada
 *   bairro e servem só para testar raio e frete (PostGIS); não são endereços reais de comércio.
 * - CPF dos donos: números FICTÍCIOS com dígitos verificadores válidos, gerados por `fakeCpf()` abaixo (não pertencem a
 *   ninguém conhecido; podem coincidir por acaso com pessoas reais, por isso nunca devem sair do ambiente de teste).
 * - Fotos: GERADAS por este código com `sharp` (gradiente + formas geométricas, sem texto, sem terceiros): não há
 *   direito autoral de terceiros, a licença é a do próprio repositório. São re-codificadas como as fotos reais (WebP, sem
 *   EXIF, larguras 160/400/800) pelo mesmo `renderVariant` do upload.
 * - Conta de recebimento: registro do provedor `fake` (sem token real; `tokens_enc` é um marcador). Só funciona com
 *   `PAYMENT_PROVIDER=fake`.
 */

export interface SeedOnda2Options {
  /** Senha dos 7 lojistas de teste. Em desenvolvimento, o padrão é público (README); em produção é obrigatória. */
  merchantPassword?: string;
  /** Armazenamento das fotos. Sem ele (ou se estiver fora do ar), as lojas nascem sem foto e o seed avisa. */
  storage?: ObjectStorage | null;
  production?: boolean;
  log?: (message: string) => void;
}

export const DEV_SEED_MERCHANT_PASSWORD = 'webag-seed-lojista-2026';

export interface SeedProduct {
  name: string;
  description: string;
  category: string;
  priceCents: number;
  promo?: { priceCents: number; days: number };
  section: string;
  attributes?: string[];
  variants: { attributes?: Record<string, string>; stock: number; priceCents?: number; sku?: string }[];
  hue: number;
}

export interface SeedStore {
  slug: string;
  name: string;
  owner: string;
  description: string;
  category: string;
  city: 'francisco-morato-sp' | 'franco-da-rocha-sp' | 'caieiras-sp';
  neighborhood: string;
  street: string;
  number: string;
  cep: string;
  lat: number;
  lng: number;
  phone: string;
  radiusM: number;
  tiers: { fromM: number; toM: number; feeCents: number }[];
  minOrderCents: number;
  freeAboveCents: number;
  pickup: boolean;
  hours: { weekdays: number[]; start: string; end: string }[];
  products: SeedProduct[];
  /** Há quantos dias a loja foi aprovada ("Lojas novas" = até 30). Padrão 0. */
  approvedDaysAgo?: number;
  /** Dias de troca voluntária (0 = não aceita). */
  voluntaryExchangeDays?: number;
  /** Loja pausada sem prazo (aparece "Fechada"). */
  paused?: boolean;
}

const WEEK = [1, 2, 3, 4, 5, 6];

export const SEED_STORES: SeedStore[] = [
  {
    slug: 'mercadinho-boa-compra', name: 'Mercadinho Boa Compra', owner: 'Marcos Teste', description: 'Mercado de bairro: hortifruti, bebidas e padaria do dia. (Loja fictícia de teste)',
    category: 'Mercado', city: 'francisco-morato-sp', neighborhood: 'Centro', street: 'Rua das Palmeiras (fictícia)', number: '100', cep: '07900100', lat: -23.2808, lng: -46.7442, phone: '11911110001',
    radiusM: 5000, tiers: [{ fromM: 0, toM: 2000, feeCents: 500 }, { fromM: 2000, toM: 5000, feeCents: 900 }], minOrderCents: 2000, freeAboveCents: 8000, pickup: true,
    hours: [{ weekdays: WEEK, start: '07:00', end: '20:00' }, { weekdays: [0], start: '08:00', end: '13:00' }],
    products: [
      { name: 'Banana prata (kg)', description: 'Banana prata selecionada, preço por quilo.', category: 'Hortifruti', priceCents: 599, section: 'Hortifruti', hue: 50, variants: [{ stock: 60, sku: 'MBC-BAN' }] },
      { name: 'Tomate (kg)', description: 'Tomate vermelho, preço por quilo.', category: 'Hortifruti', priceCents: 799, promo: { priceCents: 649, days: 5 }, section: 'Hortifruti', hue: 8, variants: [{ stock: 40, sku: 'MBC-TOM' }] },
      { name: 'Refrigerante cola 2L', description: 'Garrafa de 2 litros.', category: 'Bebidas', priceCents: 949, section: 'Bebidas', hue: 20, variants: [{ stock: 80, sku: 'MBC-REF' }] },
      { name: 'Suco de laranja 1L', description: 'Integral, sem adição de açúcar.', category: 'Bebidas', priceCents: 1099, section: 'Bebidas', hue: 35, variants: [{ stock: 24, sku: 'MBC-SUC' }] },
      { name: 'Pão francês (10 un.)', description: 'Fornada do dia.', category: 'Padaria', priceCents: 1190, section: 'Padaria', hue: 30, variants: [{ stock: 30, sku: 'MBC-PAO' }] },
      { name: 'Bolo de fubá (fatia)', description: 'Fatia caseira.', category: 'Padaria', priceCents: 690, section: 'Padaria', hue: 45, variants: [{ stock: 2, sku: 'MBC-BOL' }] },
    ],
  },
  {
    slug: 'farmacia-saude-ja', name: 'Farmácia Saúde Já', owner: 'Helena Teste', description: 'Higiene e cuidados pessoais. (Loja fictícia de teste)',
    category: 'Farmácia', city: 'francisco-morato-sp', neighborhood: 'Jardim Alegria', street: 'Avenida Exemplo (fictícia)', number: '250', cep: '07900200', lat: -23.2705, lng: -46.7510, phone: '11911110002',
    radiusM: 4000, tiers: [{ fromM: 0, toM: 4000, feeCents: 600 }], minOrderCents: 1500, freeAboveCents: 6000, pickup: true,
    hours: [{ weekdays: [0, ...WEEK], start: '08:00', end: '22:00' }],
    products: [
      { name: 'Sabonete em barra (3 un.)', description: 'Sabonete neutro.', category: 'Higiene', priceCents: 790, section: 'Higiene', hue: 190, variants: [{ stock: 50, sku: 'FSJ-SAB' }] },
      { name: 'Creme dental 90g', description: 'Com flúor.', category: 'Higiene', priceCents: 599, section: 'Higiene', hue: 200, variants: [{ stock: 70, sku: 'FSJ-CRE' }] },
      { name: 'Shampoo 350ml', description: 'Uso diário.', category: 'Cuidados pessoais', priceCents: 1490, promo: { priceCents: 1190, days: 10 }, section: 'Cuidados', hue: 280, variants: [{ stock: 35, sku: 'FSJ-SHA' }] },
      { name: 'Protetor solar FPS 50', description: '120g.', category: 'Cuidados pessoais', priceCents: 3290, section: 'Cuidados', hue: 55, variants: [{ stock: 12, sku: 'FSJ-PRO' }] },
      { name: 'Álcool em gel 500ml', description: '70%.', category: 'Higiene', priceCents: 1190, section: 'Higiene', hue: 170, variants: [{ stock: 3, sku: 'FSJ-ALC' }] },
      { name: 'Escova de dentes', description: 'Cerdas macias.', category: 'Higiene', priceCents: 690, section: 'Higiene', hue: 215, attributes: ['Cor'], variants: [{ attributes: { Cor: 'Azul' }, stock: 20, sku: 'FSJ-ESC-AZ' }, { attributes: { Cor: 'Verde' }, stock: 0, sku: 'FSJ-ESC-VD' }] },
    ],
  },
  {
    slug: 'pet-shop-amigo-fiel', name: 'Pet Shop Amigo Fiel', owner: 'Rafael Teste', description: 'Ração e acessórios para cães e gatos. (Loja fictícia de teste)',
    category: 'Pet', city: 'francisco-morato-sp', neighborhood: 'Vila Rosa', street: 'Rua Modelo (fictícia)', number: '45', cep: '07900300', lat: -23.2890, lng: -46.7380, phone: '11911110003',
    radiusM: 6000, tiers: [{ fromM: 0, toM: 3000, feeCents: 700 }, { fromM: 3000, toM: 6000, feeCents: 1200 }], minOrderCents: 3000, freeAboveCents: 12000, pickup: false,
    hours: [{ weekdays: WEEK, start: '09:00', end: '18:00' }],
    products: [
      { name: 'Ração para cães adultos', description: 'Sabor carne.', category: 'Ração', priceCents: 8990, section: 'Rações', hue: 25, attributes: ['Peso'], variants: [{ attributes: { Peso: '3 kg' }, stock: 15, priceCents: 8990, sku: 'PAF-RC-3' }, { attributes: { Peso: '10 kg' }, stock: 8, priceCents: 21990, sku: 'PAF-RC-10' }] },
      { name: 'Ração para gatos castrados', description: 'Sabor peixe.', category: 'Ração', priceCents: 6990, section: 'Rações', hue: 205, attributes: ['Peso'], variants: [{ attributes: { Peso: '1 kg' }, stock: 20, priceCents: 6990, sku: 'PAF-RG-1' }, { attributes: { Peso: '3 kg' }, stock: 6, priceCents: 16990, sku: 'PAF-RG-3' }] },
      { name: 'Coleira ajustável', description: 'Nylon resistente.', category: 'Acessórios', priceCents: 2490, section: 'Acessórios', hue: 350, attributes: ['Tamanho', 'Cor'], variants: [{ attributes: { Tamanho: 'P', Cor: 'Vermelha' }, stock: 10, sku: 'PAF-COL-P-VM' }, { attributes: { Tamanho: 'M', Cor: 'Vermelha' }, stock: 10, sku: 'PAF-COL-M-VM' }, { attributes: { Tamanho: 'M', Cor: 'Azul' }, stock: 4, sku: 'PAF-COL-M-AZ' }] },
      { name: 'Bolinha de borracha', description: 'Brinquedo resistente.', category: 'Acessórios', priceCents: 1290, promo: { priceCents: 990, days: 7 }, section: 'Acessórios', hue: 95, variants: [{ stock: 30, sku: 'PAF-BOL' }] },
      { name: 'Comedouro inox', description: 'Antiderrapante.', category: 'Acessórios', priceCents: 3490, section: 'Acessórios', hue: 220, variants: [{ stock: 14, sku: 'PAF-COM' }] },
      { name: 'Areia higiênica 4kg', description: 'Granulado fino.', category: 'Acessórios', priceCents: 1990, section: 'Acessórios', hue: 40, variants: [{ stock: 25, sku: 'PAF-ARE' }] },
    ],
  },
  {
    slug: 'moda-express-franco', name: 'Moda Express Franco', owner: 'Camila Teste', description: 'Roupas e calçados do dia a dia. (Loja fictícia de teste)',
    category: 'Moda e calçados', city: 'franco-da-rocha-sp', neighborhood: 'Centro', street: 'Rua Fictícia', number: '12', cep: '07850100', lat: -23.3220, lng: -46.7262, phone: '11911110004',
    radiusM: 5000, tiers: [{ fromM: 0, toM: 2500, feeCents: 800 }, { fromM: 2500, toM: 5000, feeCents: 1300 }], minOrderCents: 4000, freeAboveCents: 15000, pickup: true,
    hours: [{ weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }, { weekdays: [6], start: '09:00', end: '15:00' }],
    products: [
      { name: 'Camiseta básica algodão', description: 'Algodão penteado.', category: 'Roupas', priceCents: 4990, promo: { priceCents: 3990, days: 14 }, section: 'Camisetas', hue: 210, attributes: ['Tamanho', 'Cor'], variants: [{ attributes: { Tamanho: 'P', Cor: 'Preta' }, stock: 12, sku: 'MEF-CAM-P-PT' }, { attributes: { Tamanho: 'M', Cor: 'Preta' }, stock: 15, sku: 'MEF-CAM-M-PT' }, { attributes: { Tamanho: 'G', Cor: 'Preta' }, stock: 0, sku: 'MEF-CAM-G-PT' }, { attributes: { Tamanho: 'M', Cor: 'Branca' }, stock: 9, sku: 'MEF-CAM-M-BR' }] },
      { name: 'Bermuda de sarja', description: 'Sarja leve.', category: 'Roupas', priceCents: 7990, section: 'Bermudas', hue: 35, attributes: ['Tamanho'], variants: [{ attributes: { Tamanho: '38' }, stock: 6, sku: 'MEF-BER-38' }, { attributes: { Tamanho: '40' }, stock: 8, sku: 'MEF-BER-40' }, { attributes: { Tamanho: '42' }, stock: 3, sku: 'MEF-BER-42' }] },
      { name: 'Vestido midi floral', description: 'Tecido leve.', category: 'Roupas', priceCents: 12990, section: 'Vestidos', hue: 320, attributes: ['Tamanho'], variants: [{ attributes: { Tamanho: 'P' }, stock: 4, sku: 'MEF-VES-P' }, { attributes: { Tamanho: 'M' }, stock: 5, sku: 'MEF-VES-M' }] },
      { name: 'Tênis casual', description: 'Solado de borracha.', category: 'Calçados', priceCents: 18990, section: 'Calçados', hue: 15, attributes: ['Número'], variants: [{ attributes: { Número: '38' }, stock: 3, sku: 'MEF-TEN-38' }, { attributes: { Número: '40' }, stock: 5, sku: 'MEF-TEN-40' }, { attributes: { Número: '42' }, stock: 2, sku: 'MEF-TEN-42' }] },
      { name: 'Chinelo de borracha', description: 'Palmilha anatômica.', category: 'Calçados', priceCents: 2990, section: 'Calçados', hue: 175, attributes: ['Número'], variants: [{ attributes: { Número: '39' }, stock: 20, sku: 'MEF-CHI-39' }, { attributes: { Número: '41' }, stock: 18, sku: 'MEF-CHI-41' }] },
      { name: 'Boné aba reta', description: 'Ajustável.', category: 'Acessórios', priceCents: 3490, section: 'Acessórios', hue: 260, variants: [{ stock: 11, sku: 'MEF-BON' }] },
    ],
  },
  {
    slug: 'casa-e-cia-utilidades', name: 'Casa & Cia Utilidades', owner: 'Paulo Teste', description: 'Utilidades domésticas e itens elétricos. (Loja fictícia de teste)',
    category: 'Casa e construção', city: 'franco-da-rocha-sp', neighborhood: 'Vila Rosalina', street: 'Rua Imaginária', number: '300', cep: '07850200', lat: -23.3180, lng: -46.7330, phone: '11911110005',
    radiusM: 5000, tiers: [{ fromM: 0, toM: 5000, feeCents: 900 }], minOrderCents: 2500, freeAboveCents: 10000, pickup: true,
    hours: [{ weekdays: WEEK, start: '08:00', end: '18:00' }],
    products: [
      { name: 'Jogo de panelas 5 peças', description: 'Antiaderente.', category: 'Utilidades', priceCents: 24990, promo: { priceCents: 19990, days: 20 }, section: 'Cozinha', hue: 0, variants: [{ stock: 7, sku: 'CCU-PAN' }] },
      { name: 'Escorredor de louça', description: 'Aço com revestimento.', category: 'Utilidades', priceCents: 6990, section: 'Cozinha', hue: 210, variants: [{ stock: 12, sku: 'CCU-ESC' }] },
      { name: 'Lâmpada LED 9W', description: 'Luz branca.', category: 'Elétrica', priceCents: 1190, section: 'Elétrica', hue: 58, attributes: ['Luz'], variants: [{ attributes: { Luz: 'Branca' }, stock: 100, sku: 'CCU-LED-BR' }, { attributes: { Luz: 'Amarela' }, stock: 60, sku: 'CCU-LED-AM' }] },
      { name: 'Extensão elétrica 3m', description: '3 tomadas.', category: 'Elétrica', priceCents: 3490, section: 'Elétrica', hue: 28, variants: [{ stock: 22, sku: 'CCU-EXT' }] },
      { name: 'Chave de fenda (jogo 6)', description: 'Cabo emborrachado.', category: 'Ferramentas', priceCents: 4290, section: 'Ferramentas', hue: 150, variants: [{ stock: 16, sku: 'CCU-CHA' }] },
      { name: 'Martelo 500g', description: 'Cabo de madeira.', category: 'Ferramentas', priceCents: 3990, section: 'Ferramentas', hue: 100, variants: [{ stock: 9, sku: 'CCU-MAR' }] },
    ],
  },
  {
    slug: 'papelaria-ponto-do-saber', name: 'Papelaria Ponto do Saber', owner: 'Beatriz Teste', description: 'Material escolar e de escritório. (Loja fictícia de teste)',
    category: 'Papelaria', city: 'francisco-morato-sp', neighborhood: 'Jardim Dos Eucaliptos', street: 'Rua do Teste', number: '77', cep: '07900400', lat: -23.2760, lng: -46.7290, phone: '11911110006',
    radiusM: 4000, tiers: [{ fromM: 0, toM: 4000, feeCents: 500 }], minOrderCents: 1000, freeAboveCents: 5000, pickup: true,
    hours: [{ weekdays: WEEK, start: '08:00', end: '19:00' }],
    products: [
      { name: 'Caderno 10 matérias', description: 'Capa dura.', category: 'Material escolar', priceCents: 3290, section: 'Cadernos', hue: 230, attributes: ['Capa'], variants: [{ attributes: { Capa: 'Azul' }, stock: 25, sku: 'PPS-CAD-AZ' }, { attributes: { Capa: 'Vermelha' }, stock: 18, sku: 'PPS-CAD-VM' }] },
      { name: 'Caneta esferográfica (cx. 12)', description: 'Tinta azul.', category: 'Material escolar', priceCents: 1890, section: 'Escrita', hue: 215, variants: [{ stock: 40, sku: 'PPS-CAN' }] },
      { name: 'Lápis de cor 24 cores', description: 'Madeira certificada.', category: 'Material escolar', priceCents: 2290, promo: { priceCents: 1890, days: 9 }, section: 'Escrita', hue: 120, variants: [{ stock: 30, sku: 'PPS-LAP' }] },
      { name: 'Mochila escolar', description: 'Com compartimento para notebook.', category: 'Material escolar', priceCents: 12990, section: 'Mochilas', hue: 290, attributes: ['Cor'], variants: [{ attributes: { Cor: 'Preta' }, stock: 7, sku: 'PPS-MOC-PT' }, { attributes: { Cor: 'Cinza' }, stock: 4, sku: 'PPS-MOC-CZ' }] },
      { name: 'Papel sulfite A4 (500 fls.)', description: 'Alvura 90%.', category: 'Escritório', priceCents: 2990, section: 'Escritório', hue: 60, variants: [{ stock: 50, sku: 'PPS-SUL' }] },
      { name: 'Grampeador de mesa', description: 'Até 20 folhas.', category: 'Escritório', priceCents: 2490, section: 'Escritório', hue: 340, variants: [{ stock: 13, sku: 'PPS-GRA' }] },
    ],
  },
  {
    slug: 'eletro-conecta', name: 'Eletro Conecta', owner: 'Diego Teste', description: 'Acessórios de celular e áudio. (Loja fictícia de teste)',
    category: 'Eletrônicos', city: 'franco-da-rocha-sp', neighborhood: 'Jardim Luciana', street: 'Travessa Fictícia', number: '8', cep: '07850300', lat: -23.3300, lng: -46.7180, phone: '11911110007',
    radiusM: 6000, tiers: [{ fromM: 0, toM: 3000, feeCents: 700 }, { fromM: 3000, toM: 6000, feeCents: 1100 }], minOrderCents: 3000, freeAboveCents: 20000, pickup: false,
    hours: [{ weekdays: [1, 2, 3, 4, 5], start: '10:00', end: '19:00' }, { weekdays: [6], start: '10:00', end: '14:00' }],
    products: [
      { name: 'Fone de ouvido com fio', description: 'Plugue P2, com microfone.', category: 'Áudio', priceCents: 2990, section: 'Áudio', hue: 260, attributes: ['Cor'], variants: [{ attributes: { Cor: 'Preto' }, stock: 30, sku: 'EC-FON-PT' }, { attributes: { Cor: 'Branco' }, stock: 14, sku: 'EC-FON-BR' }] },
      { name: 'Caixa de som Bluetooth', description: 'À prova de respingos.', category: 'Áudio', priceCents: 17990, promo: { priceCents: 14990, days: 12 }, section: 'Áudio', hue: 200, variants: [{ stock: 8, sku: 'EC-CXS' }] },
      { name: 'Carregador USB-C 20W', description: 'Carga rápida.', category: 'Celulares', priceCents: 6990, section: 'Celulares', hue: 20, variants: [{ stock: 25, sku: 'EC-CAR' }] },
      { name: 'Cabo USB-C 1m', description: 'Reforçado.', category: 'Celulares', priceCents: 2490, section: 'Celulares', hue: 100, variants: [{ stock: 3, sku: 'EC-CAB' }] },
      { name: 'Película de vidro', description: 'Para aparelhos selecionados.', category: 'Celulares', priceCents: 1990, section: 'Celulares', hue: 180, variants: [{ stock: 40, sku: 'EC-PEL' }] },
      { name: 'Mouse sem fio', description: 'Receptor USB.', category: 'Informática', priceCents: 4990, section: 'Informática', hue: 300, variants: [{ stock: 17, sku: 'EC-MOU' }] },
    ],
  },
];

/** CPF fictício com dígitos verificadores válidos, derivado do slug (sempre o mesmo para a mesma loja). */
export function fakeCpf(seed: string): string {
  const hash = createHash('sha256').update(seed).digest();
  const digits = Array.from({ length: 9 }, (_, i) => hash[i]! % 10);
  const check = (base: number[]): number => {
    const sum = base.reduce((acc, d, i) => acc + d * (base.length + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = check(digits);
  const d2 = check([...digits, d1]);
  const cpf = [...digits, d1, d2].join('');
  return /^(\d)\1{10}$/.test(cpf) ? fakeCpf(`${seed}!`) : cpf;
}

const toMin = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** Foto gerada: gradiente + formas, sem texto (não depende de fontes) e sem material de terceiros. */
export async function generateProductImage(hue: number, variant: number): Promise<Buffer> {
  const a = `hsl(${hue % 360}, 70%, 62%)`;
  const b = `hsl(${(hue + 40) % 360}, 65%, 40%)`;
  const shape =
    variant % 3 === 0
      ? `<circle cx="600" cy="600" r="300" fill="rgba(255,255,255,0.28)"/><circle cx="600" cy="600" r="170" fill="rgba(255,255,255,0.35)"/>`
      : variant % 3 === 1
        ? `<rect x="300" y="300" width="600" height="600" rx="80" fill="rgba(255,255,255,0.28)" transform="rotate(12 600 600)"/><rect x="430" y="430" width="340" height="340" rx="50" fill="rgba(255,255,255,0.35)" transform="rotate(12 600 600)"/>`
        : `<polygon points="600,260 920,860 280,860" fill="rgba(255,255,255,0.30)"/><circle cx="600" cy="640" r="110" fill="rgba(255,255,255,0.38)"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1200" height="1200" fill="url(#g)"/>${shape}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const IMAGE_WIDTHS = [160, 400, 800] as const;

export async function seedOnda2(db: Db, options: SeedOnda2Options = {}): Promise<void> {
  await seedStores(db, SEED_STORES, options);
  const log = options.log ?? (() => undefined);
  log(`seed da Onda 2 concluído. Login dos lojistas de teste: lojista.<loja>@seed.webag.local (senha ${options.production ? 'de SEED_MERCHANT_PASSWORD' : DEV_SEED_MERCHANT_PASSWORD})`);
}

/** Cria as lojas da lista que ainda não existem (idempotente pelo e-mail do dono). Usado pelas Ondas 2 e 3. */
export async function seedStores(db: Db, seeds: SeedStore[], options: SeedOnda2Options = {}): Promise<void> {
  const log = options.log ?? (() => undefined);
  // DEC-030d: dados fictícios nunca entram em produção, nem com flag.
  if (options.production || process.env.NODE_ENV === 'production') throw new Error('Seed de demonstração não roda em produção');
  const password = options.merchantPassword ?? DEV_SEED_MERCHANT_PASSWORD;
  const passwords = new PasswordService();
  passwords.assertPolicy(password, 8);
  const passwordHash = await passwords.hash(password);

  const allCategories = await db.select().from(categories);
  const categoryId = (name: string): string => {
    const found = allCategories.find((c) => c.name === name);
    if (!found) throw new Error(`Categoria "${name}" não existe: rode o seed da Onda 1 antes`);
    return found.id;
  };
  const allCities = await db.select().from(cities);
  const docs = await db.select().from(legalDocuments);
  let storageDown = false;

  for (const seed of seeds) {
    const email = `lojista.${seed.slug}@seed.webag.local`;
    const [existingUser] = await db.select().from(users).where(eq(users.email, email));
    if (existingUser) {
      log(`loja ${seed.name}: já existe (pulada)`);
      continue;
    }
    const city = allCities.find((c) => c.slug === seed.city);
    if (!city) throw new Error(`Cidade ${seed.city} não existe: rode o seed da Onda 1 antes`);

    const [owner] = await db.insert(users).values({ email, name: seed.owner, passwordHash, emailVerifiedAt: new Date(), phone: seed.phone, adultDeclaredAt: new Date(), passwordChangedAt: new Date() }).returning();
    if (!owner) continue;
    await db.insert(userRoles).values([{ userId: owner.id, role: 'customer' }, { userId: owner.id, role: 'merchant' }]);
    for (const type of ['customer_terms', 'privacy', 'merchant_terms'] as const) {
      const latest = docs.filter((d) => d.type === type).sort((a, b) => b.version - a.version)[0];
      if (latest) await db.insert(termsAcceptances).values({ userId: owner.id, documentId: latest.id, platform: 'seed' });
    }

    const [store] = await db
      .insert(stores)
      .values({
        ownerUserId: owner.id,
        status: 'approved',
        documentType: 'cpf',
        documentNumber: fakeCpf(seed.slug),
        name: seed.name,
        description: seed.description,
        mainCategoryId: categoryId(seed.category),
        phone: seed.phone,
        whatsapp: seed.phone,
        addressCep: seed.cep,
        addressStreet: seed.street,
        addressNumber: seed.number,
        addressNeighborhood: seed.neighborhood,
        addressCityId: city.id,
        addressCityName: city.name,
        addressState: 'SP',
        lat: seed.lat,
        lng: seed.lng,
        approvedAt: new Date(Date.now() - (seed.approvedDaysAgo ?? 0) * 86_400_000),
      })
      .returning();
    if (!store) continue;
    await db.insert(storeMembers).values({ storeId: store.id, userId: owner.id, role: 'owner', permissions: [] });
    await db
      .insert(storeSettings)
      .values({ storeId: store.id, acceptsDelivery: true, radiusM: seed.radiusM, feeMode: 'by_distance', minOrderCents: seed.minOrderCents, freeAboveCents: seed.freeAboveCents, pickupEnabled: seed.pickup, voluntaryExchangeDays: seed.voluntaryExchangeDays ?? 0, pausedIndefinitely: seed.paused ?? false, etaMinMinutes: 30, etaMaxMinutes: 50 });
    await db.insert(storeDeliveryTiers).values(seed.tiers.map((t, position) => ({ storeId: store.id, position, ...t })));
    for (const block of seed.hours) {
      await db.insert(storeHours).values(block.weekdays.map((weekday) => ({ storeId: store.id, weekday, startMin: toMin(block.start), endMin: toMin(block.end) })));
    }
    await db.insert(paymentAccounts).values({ storeId: store.id, provider: 'fake', providerAccountId: `seed-${seed.slug}`, status: 'active', holderDocumentMasked: '***.***.***-**', holderMatchesStore: true, tokensEnc: 'seed-sem-token', connectedBy: owner.id });

    const sectionIds = new Map<string, string>();
    for (const [position, name] of [...new Set(seed.products.map((p) => p.section))].entries()) {
      const [section] = await db.insert(storeSections).values({ storeId: store.id, name, position }).returning();
      if (section) sectionIds.set(name, section.id);
    }

    for (const [index, item] of seed.products.entries()) {
      const now = new Date();
      const [product] = await db
        .insert(products)
        .values({
          storeId: store.id,
          name: item.name,
          description: item.description,
          categoryId: categoryId(item.category),
          sectionId: sectionIds.get(item.section) ?? null,
          position: index,
          status: 'active',
          basePriceCents: item.priceCents,
          promoPriceCents: item.promo?.priceCents ?? null,
          promoStartsAt: item.promo ? new Date(now.getTime() - 86_400_000) : null,
          promoEndsAt: item.promo ? new Date(now.getTime() + item.promo.days * 86_400_000) : null,
          variantAttributes: item.attributes ?? [],
          publishedAt: now,
        })
        .returning();
      if (!product) continue;
      await db.insert(productVariants).values(
        item.variants.map((v) => ({
          productId: product.id,
          storeId: store.id,
          attributes: v.attributes ?? {},
          attributesKey: JSON.stringify(Object.entries(v.attributes ?? {}).map(([k, val]) => [k.toLowerCase(), val.toLowerCase()]).sort(([a], [b]) => a!.localeCompare(b!))),
          sku: v.sku ?? null,
          priceCents: v.priceCents ?? null,
          stock: v.stock,
        })),
      );
      if (options.storage && !storageDown) {
        try {
          await attachGeneratedImage(db, options.storage, owner.id, store.id, product.id, item.hue, index);
        } catch (error) {
          storageDown = true;
          log(`armazenamento de fotos indisponível (${error instanceof Error ? error.message.slice(0, 80) : 'erro'}): lojas seguem sem foto`);
        }
      }
    }
    log(`loja ${seed.name} (${city.name} / ${seed.neighborhood}): ${seed.products.length} produtos`);
  }
}

async function attachGeneratedImage(db: Db, storage: ObjectStorage, ownerId: string, storeId: string, productId: string, hue: number, index: number): Promise<void> {
  const base = await generateProductImage(hue, index);
  const [asset] = await db
    .insert(mediaAssets)
    .values({ ownerUserId: ownerId, storeId, purpose: 'product_image', status: 'ready', objectKey: `seed/${productId}`, declaredContentType: 'image/png', declaredSizeBytes: base.length, contentType: 'image/png', sizeBytes: base.length, width: 1200, height: 1200, expiresAt: new Date(), completedAt: new Date() })
    .returning();
  if (!asset) return;
  const variants: Record<string, string> = {};
  for (const width of IMAGE_WIDTHS) {
    const key = `media/${asset.id}/${width}.webp`;
    await storage.putObject('public', key, await renderVariant(base, width), 'image/webp');
    variants[String(width)] = key;
  }
  await db.update(mediaAssets).set({ variants }).where(eq(mediaAssets.id, asset.id));
  await db.insert(productImages).values({ productId, assetId: asset.id, position: 0 });
}
