import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSearchHistory, saveSearchTerm, wipeSearchHistory } from '../../api/catalog-api';
import { onSessionCleared, useSession } from '../../api/session';
import { createPersistedStore } from '../../lib/persisted-store';

/**
 * Histórico de busca (WB-015): até 10 termos, o mais recente primeiro. No aparelho sempre (visitante também) e, com login, também na
 * conta (`/v1/me/search-history`) para valer em outros aparelhos. É dado pessoal: some do aparelho no fim da sessão (SEC-122).
 */
export const MAX_HISTORY = 10;

const normalize = (term: string): string =>
  term
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export const searchHistoryStore = createPersistedStore<string[]>('webag.search-history.v1', [], (raw) =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').slice(0, MAX_HISTORY) : [],
);

onSessionCleared(() => searchHistoryStore.reset());

/** Termo novo vai ao topo; repetido (sem acento, caixa e espaços extras) só volta ao topo. */
export function pushTerm(list: readonly string[], term: string): string[] {
  const clean = term.trim().replace(/\s+/g, ' ');
  const key = normalize(clean);
  return [clean, ...list.filter((t) => normalize(t) !== key)].slice(0, MAX_HISTORY);
}

export function useSearchHistory() {
  const client = useQueryClient();
  const session = useSession();
  const authed = session.status === 'authenticated';
  const local = searchHistoryStore.useValue();
  const remote = useQuery({ queryKey: ['search-history'], queryFn: fetchSearchHistory, enabled: authed, staleTime: 60_000 });
  const terms = authed && remote.data ? remote.data.data.map((i) => i.term).slice(0, MAX_HISTORY) : local;

  const record = async (term: string): Promise<void> => {
    if (term.trim().length < 2) return;
    await searchHistoryStore.set((prev) => pushTerm(prev, term));
    if (authed) {
      // melhor esforço: o histórico local já está salvo; sem rede, a conta fica sem este termo
      void saveSearchTerm(term.trim())
        .then(() => client.invalidateQueries({ queryKey: ['search-history'] }))
        .catch(() => undefined);
    }
  };

  const clear = async (): Promise<void> => {
    await searchHistoryStore.reset();
    if (authed) {
      client.setQueryData(['search-history'], { data: [], nextCursor: null });
      void wipeSearchHistory().catch(() => void client.invalidateQueries({ queryKey: ['search-history'] }));
    }
  };

  return { terms, record, clear };
}
