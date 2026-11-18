import { createPersistedStore } from '../../lib/persisted-store';

/**
 * Sacola LOCAL: só do visitante (WB-005). Com login a sacola vive no servidor (`/v1/cart`, ADR-010) e esta aqui é enviada
 * por `POST /v1/cart/merge` e esvaziada. Preço e estoque guardados aqui são só o que o visitante VIU: quem decide o valor é o
 * servidor ao juntar e no pagamento. Sem dado pessoal; vence em 7 dias sem mexer (RN-05).
 */
export interface CartItem {
  /** `variantId` (a API da sacola trabalha por variação). */
  key: string;
  variantId: string;
  productId: string;
  name: string;
  /** "42 · Preto" */
  variantLabel: string | null;
  urls: Record<string, string>;
  /** Preço que o visitante viu ao adicionar (centavos). */
  unitPriceCents: number;
  originalPriceCents: number | null;
  quantity: number;
  /** Teto da quantidade visto ao adicionar. */
  maxQuantity: number;
}

export interface CartState {
  storeId: string | null;
  storeName: string | null;
  items: CartItem[];
  /** Última mudança (epoch ms). */
  updatedAt: number;
}

export const CART_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_ITEM_QUANTITY = 50;
const MAX_LOCAL_ITEMS = 50;

const EMPTY: CartState = { storeId: null, storeName: null, items: [], updatedAt: 0 };

function isItem(value: unknown): value is CartItem {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.key === 'string' && typeof v.variantId === 'string' && typeof v.productId === 'string' && typeof v.unitPriceCents === 'number' && typeof v.quantity === 'number';
}

function parse(raw: unknown): CartState {
  if (typeof raw !== 'object' || raw === null) return EMPTY;
  const v = raw as Partial<CartState>;
  const items = Array.isArray(v.items) ? v.items.filter(isItem).slice(0, MAX_LOCAL_ITEMS) : [];
  if (items.length === 0 || typeof v.storeId !== 'string') return EMPTY;
  return { storeId: v.storeId, storeName: typeof v.storeName === 'string' ? v.storeName : '', items, updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : Date.now() };
}

export const cartStore = createPersistedStore<CartState>('webag.cart.v2', EMPTY, parse);

/** Mudança de loja pede confirmação (WB-021): o item novo só entra depois do "Esvaziar e continuar". */
export type AddResult = { kind: 'added'; quantity: number } | { kind: 'store-conflict'; currentStoreName: string; itemCount: number };

export interface NewItem extends Omit<CartItem, 'key' | 'quantity'> {
  quantity: number;
}

const clampQty = (qty: number, max: number): number => Math.max(1, Math.min(qty, max, MAX_ITEM_QUANTITY));

export const cartActions = {
  /** Sacola vencida (7 dias sem mexer) é esvaziada ao abrir o app. Devolve true se esvaziou, para o aviso único. */
  async expireIfStale(now: number = Date.now()): Promise<boolean> {
    const s = cartStore.get();
    if (s.items.length > 0 && now - s.updatedAt > CART_TTL_MS) {
      await cartStore.reset();
      return true;
    }
    return false;
  },

  async add(storeId: string, storeName: string, item: NewItem): Promise<AddResult> {
    const s = cartStore.get();
    if (s.storeId !== null && s.storeId !== storeId && s.items.length > 0) {
      return { kind: 'store-conflict', currentStoreName: s.storeName ?? '', itemCount: s.items.reduce((n, i) => n + i.quantity, 0) };
    }
    const key = item.variantId;
    let finalQty = 0;
    await cartStore.set((prev) => {
      const same = prev.storeId === storeId ? prev.items : [];
      const existing = same.find((i) => i.key === key);
      finalQty = clampQty((existing?.quantity ?? 0) + item.quantity, item.maxQuantity);
      const merged: CartItem = { ...item, key, quantity: finalQty };
      const items = existing ? same.map((i) => (i.key === key ? merged : i)) : [...same, merged];
      return { storeId, storeName, items, updatedAt: Date.now() };
    });
    return { kind: 'added', quantity: finalQty };
  },

  /** "Esvaziar e continuar": a sacola passa a ser só da loja nova. */
  async replaceWith(storeId: string, storeName: string, item: NewItem): Promise<void> {
    await cartStore.set({ storeId, storeName, items: [{ ...item, key: item.variantId, quantity: clampQty(item.quantity, item.maxQuantity) }], updatedAt: Date.now() });
  },

  async setQuantity(key: string, quantity: number): Promise<void> {
    await cartStore.set((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.key === key ? { ...i, quantity: clampQty(quantity, i.maxQuantity) } : i)),
      updatedAt: Date.now(),
    }));
  },

  async remove(key: string): Promise<CartItem | undefined> {
    const removed = cartStore.get().items.find((i) => i.key === key);
    await cartStore.set((prev) => {
      const items = prev.items.filter((i) => i.key !== key);
      return items.length === 0 ? EMPTY : { ...prev, items, updatedAt: Date.now() };
    });
    return removed;
  },

  /** Desfazer "removido": volta o item (se a sacola já tem outra loja, não volta). */
  async restore(storeId: string, storeName: string, item: CartItem): Promise<void> {
    const s = cartStore.get();
    if (s.storeId !== null && s.storeId !== storeId && s.items.length > 0) return;
    await cartStore.set((prev) => ({ storeId, storeName, items: [...(prev.storeId === storeId ? prev.items : []), item], updatedAt: Date.now() }));
  },

  clear: () => cartStore.reset(),
};

export const useLocalCart = (): CartState => cartStore.useValue();
