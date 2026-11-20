import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { fetchSuggestions } from '../../../src/api/catalog-api';
import { Button } from '../../../src/components/Button';
import { ClockCounterClockwise, SquaresFour, Storefront, Tag } from '../../../src/components/icons';
import { Screen } from '../../../src/components/Screen';
import { SectionHeader } from '../../../src/components/SectionHeader';
import { Skeleton } from '../../../src/components/Skeleton';
import { Text } from '../../../src/components/Text';
import { useToast } from '../../../src/components/Toast';
import { useCategoriesQuery, useDeliveryPoint } from '../../../src/features/catalog/queries';
import { useSearchHistory } from '../../../src/features/search/history';
import { SearchInput } from '../../../src/features/search/SearchInput';
import { t } from '../../../src/i18n';
import { useDebouncedValue } from '../../../src/lib/useDebouncedValue';
import { useOnline } from '../../../src/lib/useOnline';
import { theme } from '../../../src/theme';

interface Suggestion {
  key: string;
  id: string;
  name: string;
  kind: 'product' | 'store' | 'category';
}

/** Trecho digitado em negrito dentro da sugestão (sem acento e sem diferenciar maiúsculas). */
function Highlighted({ text, query }: { text: string; query: string }) {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const at = norm(text).indexOf(norm(query.trim()));
  if (at < 0 || query.trim().length === 0) return <Text>{text}</Text>;
  const end = at + query.trim().length;
  return (
    <Text>
      {text.slice(0, at)}
      <Text variant="bodyStrong">{text.slice(at, end)}</Text>
      {text.slice(end)}
    </Text>
  );
}

/** D6. Busca: histórico e sugestões (WB-013 C4, WB-015). Buscar é pela tecla "Buscar" do teclado; não há botão na tela. */
export default function SearchScreen() {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const point = useDeliveryPoint();
  const history = useSearchHistory();
  const categories = useCategoriesQuery();
  const [text, setText] = useState('');
  const term = text.trim();
  const debounced = useDebouncedValue(term, 300);
  const enabled = debounced.length >= 2 && point !== null && online;
  const suggestions = useQuery({
    queryKey: ['suggestions', debounced, point?.lat, point?.lng],
    queryFn: ({ signal }) => fetchSuggestions({ lat: point?.lat ?? 0, lng: point?.lng ?? 0, q: debounced }, signal),
    enabled,
    staleTime: 60_000,
  });
  const [blocked, setBlocked] = useState(false);

  const submit = async (value: string) => {
    const q = value.trim();
    if (q.length < 2) return;
    if (!online) {
      setBlocked(true);
      return;
    }
    setBlocked(false);
    await history.record(q);
    router.push({ pathname: '/results', params: { q } });
  };

  const items: Suggestion[] = suggestions.data
    ? [
        ...suggestions.data.products.map((p) => ({ key: `p-${p.id}`, id: p.id, name: p.name, kind: 'product' as const })),
        ...suggestions.data.stores.map((s) => ({ key: `s-${s.id}`, id: s.id, name: s.name, kind: 'store' as const })),
        ...suggestions.data.categories.map((c) => ({ key: `c-${c.id}`, id: c.id, name: c.name, kind: 'category' as const })),
      ]
    : [];

  const open = (s: Suggestion) => {
    if (s.kind === 'product') router.push(`/product/${s.id}`);
    else if (s.kind === 'store') router.push(`/store/${s.id}`);
    else router.push({ pathname: '/results', params: { categoryId: s.id, title: s.name } });
  };

  const showSuggestions = term.length >= 2;
  const roots = categories.data?.data ?? [];

  return (
    <Screen bottomInset={false} header={<View style={styles.header}><SearchInput onChangeText={(v) => { setText(v); setBlocked(false); }} onSubmit={() => void submit(text)} value={text} /></View>} keyboardShouldPersistTaps="handled" testID="search.screen">
      {blocked || (!online && term.length >= 2) ? (
        <Text accessibilityLiveRegion="polite" color="warning" testID="search.offline">
          {t('search.offline')}
        </Text>
      ) : null}

      {term.length === 1 ? (
        <Text color="secondary" variant="caption">
          {t('search.minChars')}
        </Text>
      ) : null}

      {showSuggestions ? (
        <View accessibilityLabel={t('search.placeholder')} style={styles.list}>
          {point === null ? <Text color="secondary">{t('search.needAddress')}</Text> : null}
          {enabled && (suggestions.isLoading || debounced !== term) && items.length === 0 ? (
            <View testID="search.suggestions-skeleton">
              {[0, 1, 2].map((i) => (
                <Skeleton height={20} key={i} style={styles.skeletonRow} width="70%" />
              ))}
            </View>
          ) : null}
          {suggestions.isError ? (
            <Text color="secondary" testID="search.suggestions-error">
              {t('search.suggestionsError')}
            </Text>
          ) : null}
          {items.map((s, i) => {
            const Icon = s.kind === 'product' ? Tag : s.kind === 'store' ? Storefront : SquaresFour;
            const kind = t(s.kind === 'product' ? 'search.kindProduct' : s.kind === 'store' ? 'search.kindStore' : 'search.kindCategory');
            return (
              <Pressable
                accessibilityLabel={t('search.suggestionA11y', { n: i + 1, total: items.length, name: s.name, kind })}
                accessibilityRole="button"
                key={s.key}
                onPress={() => open(s)}
                style={styles.row}
                testID={`search.suggestion-${s.id}`}
              >
                <Icon color={theme.color.text.secondary} size={theme.size.iconMd} />
                <View style={styles.flex}>
                  <Highlighted query={term} text={s.name} />
                </View>
              </Pressable>
            );
          })}
          {suggestions.isSuccess && items.length === 0 ? <Text color="secondary">{t('search.noSuggestions')}</Text> : null}
        </View>
      ) : (
        <>
          {history.terms.length > 0 ? (
            <View style={styles.list}>
              <SectionHeader actionLabel={t('search.clearHistory')} actionTestID="search.clear-history" onAction={() => void history.clear().then(() => toast.show(t('search.historyCleared')))} title={t('search.recent')} />
              {history.terms.map((h, i) => (
                <Pressable accessibilityLabel={t('search.historyItem', { term: h })} accessibilityRole="button" key={h} onPress={() => { setText(h); void submit(h); }} style={styles.row} testID={`search.history-${i}`}>
                  <ClockCounterClockwise color={theme.color.text.secondary} size={theme.size.iconMd} />
                  <Text style={styles.flex}>{h}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {roots.length > 0 ? (
            <View style={styles.list}>
              <Text accessibilityRole="header" variant="title2">
                {t('search.categories')}
              </Text>
              <View style={styles.chips}>
                {roots.map((c) => (
                  <Button key={c.id} label={c.name} onPress={() => router.push({ pathname: '/results', params: { categoryId: c.id, title: c.name } })} testID={`search.category-${c.id}`} variant="secondary" />
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.layout.screenPaddingX, paddingVertical: theme.space[2], minHeight: theme.size.headerHeight },
  list: { gap: theme.space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space[3], minHeight: theme.size.touchMin + theme.space[1] },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] },
  skeletonRow: { marginVertical: theme.space[2] },
});
