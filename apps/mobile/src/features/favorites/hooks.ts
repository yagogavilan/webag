import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { fetchFavorites, setFavoriteProduct, setFavoriteStore } from '../../api/catalog-api';
import { ApiError } from '../../api/problem';
import { onSessionCleared, useSession } from '../../api/session';
import { useToast } from '../../components/Toast';
import { t } from '../../i18n';
import { haptic } from '../../lib/haptics';

export type FavoriteKind = 'store' | 'product';

export interface FavoriteIds {
  store: ReadonlySet<string>;
  product: ReadonlySet<string>;
}

const EMPTY: FavoriteIds = { store: new Set(), product: new Set() };
export const FAVORITE_IDS_KEY = ['favorites', 'ids'] as const;

/** Visitante favorita -> entra -> volta à mesma tela e a ação já acontece (onda-3 §0.6). Fica só em memória. */
let pending: { kind: FavoriteKind; id: string } | null = null;
export const takePendingFavorite = (kind: FavoriteKind, id: string): boolean => {
  if (pending?.kind === kind && pending.id === id) {
    pending = null;
    return true;
  }
  return false;
};

/** Teto da conta é 200 (contrato) e a página tem até 50: no máximo 4 pedidos, em série. */
async function loadAllIds(): Promise<FavoriteIds> {
  const store = new Set<string>();
  const product = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 6; page++) {
    const result = await fetchFavorites({ limit: 50, ...(cursor ? { cursor } : {}) });
    for (const f of result.data) {
      if (f.kind === 'store' && f.store) store.add(f.store.id);
      if (f.kind === 'product' && f.product) product.add(f.product.id);
    }
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return { store, product };
}

/** Ids favoritados (para pintar o coração). Só com login; dado da conta, some no fim da sessão (SEC-122). */
export function useFavoriteIds(): FavoriteIds {
  const session = useSession();
  const query = useQuery({ queryKey: FAVORITE_IDS_KEY, queryFn: loadAllIds, enabled: session.status === 'authenticated', staleTime: 5 * 60_000 });
  return query.data ?? EMPTY;
}

export function clearFavoritesCache(client: QueryClient): void {
  client.removeQueries({ queryKey: ['favorites'] });
}

export function registerFavoritesCleanup(client: QueryClient): () => void {
  return onSessionCleared(() => clearFavoritesCache(client));
}

interface ToggleArgs {
  kind: FavoriteKind;
  id: string;
  name: string;
  on: boolean;
  /** Mensagem de sucesso (a loja mostra "Loja salva nos favoritos."). */
  silent?: boolean;
}

/**
 * Favoritar com atualização otimista: o coração muda na hora; se a API recusar, volta e avisa. Sem rede a ação espera na fila do
 * TanStack Query e sai quando a conexão voltar (ação segura; só vale enquanto o app está aberto).
 * Visitante: abre a tela de entrar e, no retorno, a tela chama `useApplyPendingFavorite` para executar.
 */
export function useFavorite(kind: FavoriteKind, id: string | undefined, name: string) {
  const client = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const session = useSession();
  const ids = useFavoriteIds();
  const isFavorite = id !== undefined && ids[kind].has(id);

  const mutation = useMutation({
    networkMode: 'online',
    mutationFn: async (args: ToggleArgs) => (args.kind === 'store' ? setFavoriteStore(args.id, args.on) : setFavoriteProduct(args.id, args.on)),
    onMutate: async (args) => {
      await client.cancelQueries({ queryKey: FAVORITE_IDS_KEY });
      const previous = client.getQueryData<FavoriteIds>(FAVORITE_IDS_KEY);
      const next = { store: new Set(previous?.store), product: new Set(previous?.product) };
      if (args.on) next[args.kind].add(args.id);
      else next[args.kind].delete(args.id);
      client.setQueryData<FavoriteIds>(FAVORITE_IDS_KEY, next);
      return { previous };
    },
    onError: (error, args, context) => {
      if (context?.previous) client.setQueryData(FAVORITE_IDS_KEY, context.previous);
      void haptic('error');
      toast.show(error instanceof ApiError && error.code === 'FAVORITES_LIMIT_REACHED' ? t('favorites.limit') : args.on ? t('favorites.saveError') : t('favorites.removeError'));
    },
    onSuccess: (_data, args) => {
      void client.invalidateQueries({ queryKey: ['favorites', 'list'] });
      if (!args.silent) toast.show(args.on ? (args.kind === 'store' ? t('store.favoriteAdded') : t('favorites.saved')) : t('favorites.removed'));
    },
  });

  const toggle = () => {
    if (!id) return;
    void haptic('light');
    if (session.status !== 'authenticated') {
      pending = { kind, id };
      router.push({ pathname: '/login', params: { returnTo: pathname } });
      return;
    }
    mutation.mutate({ kind, id, name, on: !isFavorite });
  };

  /** Chamado ao voltar do login: executa o favoritar que o visitante tinha pedido. */
  const applyPending = () => {
    if (id && session.status === 'authenticated' && takePendingFavorite(kind, id) && !isFavorite) mutation.mutate({ kind, id, name, on: true });
  };

  return { isFavorite, toggle, applyPending, loading: mutation.isPending, ready: session.status !== 'loading' };
}

/** Executa o favoritar pendente quando a tela volta do login (mesma tela, mesma posição). */
export function useApplyPendingFavorite(apply: () => void, enabled: boolean): void {
  const session = useSession();
  const authed = session.status === 'authenticated';
  useEffect(() => {
    if (authed && enabled) apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, enabled]);
}
