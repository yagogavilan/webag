import type { CategoryNode } from '@webag/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { Check } from '../../components/icons';
import { TextField } from '../../components/TextField';
import { Text } from '../../components/Text';
import { t } from '../../i18n';
import { haptic } from '../../lib/haptics';
import { theme } from '../../theme';
import { centsToField, DISTANCES_KM, NO_FILTERS, parseMoneyToCents, priceRangeInvalid, RATINGS, type Filters } from './filters';

export interface FiltersSheetProps {
  visible: boolean;
  filters: Filters;
  categories: readonly CategoryNode[];
  /** Aba Lojas: sem preço (a API não filtra loja por preço de produto). */
  forStores: boolean;
  /** Tela de categoria: a categoria é o próprio contexto e não aparece como filtro. */
  hideCategory?: boolean;
  onApply: (next: Filters) => void;
  onClose: () => void;
}

/** Folha "Filtros" (D7): rascunho local, nada muda até "Aplicar". Preço em campos (sem slider: ruim para acessibilidade). */
export function FiltersSheet({ visible, filters, categories, forStores, hideCategory, onApply, onClose }: FiltersSheetProps) {
  const [draft, setDraft] = useState<Filters>(filters);
  const [minText, setMinText] = useState(centsToField(filters.minPriceCents));
  const [maxText, setMaxText] = useState(centsToField(filters.maxPriceCents));
  const [syncedFor, setSyncedFor] = useState(filters);

  // reabre com os filtros atuais (o pai pode ter removido um chip com o "x")
  if (syncedFor !== filters) {
    setSyncedFor(filters);
    setDraft(filters);
    setMinText(centsToField(filters.minPriceCents));
    setMaxText(centsToField(filters.maxPriceCents));
  }

  const min = parseMoneyToCents(minText);
  const max = parseMoneyToCents(maxText);
  const invalid = priceRangeInvalid(min, max);

  const apply = () => {
    if (invalid) {
      void haptic('error');
      return;
    }
    onApply({ ...draft, minPriceCents: forStores ? null : min, maxPriceCents: forStores ? null : max });
  };

  const clearAll = () => {
    setDraft({ ...NO_FILTERS, categoryId: hideCategory ? filters.categoryId : null });
    setMinText('');
    setMaxText('');
  };

  return (
    <BottomSheet
      footer={
        <>
          <Button label={t('filters.apply')} onPress={apply} size="lg" testID="filters.apply" />
          <Button label={t('filters.clear')} onPress={clearAll} testID="filters.clear" variant="text" />
        </>
      }
      hideClose={false}
      onClose={onClose}
      testID="filters.sheet"
      title={t('filters.title')}
      visible={visible}
    >
      {!hideCategory && categories.length > 0 ? (
        <Group title={t('filters.category')}>
          <View style={styles.chips}>
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} onPress={() => setDraft((d) => ({ ...d, categoryId: d.categoryId === c.id ? null : c.id }))} selected={draft.categoryId === c.id} testID={`filters.category-${c.id}`} />
            ))}
          </View>
        </Group>
      ) : null}

      {!forStores ? (
        <Group title={t('filters.price')}>
          <View style={styles.priceRow}>
            <View style={styles.flex}>
              <TextField error={invalid ? t('filters.priceError') : undefined} keyboardType="decimal-pad" label={t('filters.priceMin')} onChangeText={setMinText} placeholder="R$ 0,00" testID="filters.price-min" value={minText} />
            </View>
            <View style={styles.flex}>
              <TextField keyboardType="decimal-pad" label={t('filters.priceMax')} onChangeText={setMaxText} placeholder="R$ 0,00" testID="filters.price-max" value={maxText} />
            </View>
          </View>
        </Group>
      ) : null}

      <Group title={t('filters.distance')}>
        <View style={styles.chips}>
          {DISTANCES_KM.map((km) => (
            <Chip key={km} label={t('filters.distanceKm', { km })} onPress={() => setDraft((d) => ({ ...d, maxDistanceKm: d.maxDistanceKm === km ? null : km }))} selected={draft.maxDistanceKm === km} testID={`filters.distance-${km}`} />
          ))}
        </View>
      </Group>

      <Group title={t('filters.rating')}>
        <View style={styles.chips}>
          {RATINGS.map((n) => (
            <Chip key={n} label={t('filters.ratingN', { n })} onPress={() => setDraft((d) => ({ ...d, minRating: d.minRating === n ? null : n }))} selected={draft.minRating === n} testID={`filters.rating-${n}`} />
          ))}
        </View>
      </Group>

      <SwitchRow label={t('filters.freeDelivery')} onChange={(v) => setDraft((d) => ({ ...d, freeShipping: v }))} testID="filters.free-delivery" value={draft.freeShipping} />
      <SwitchRow label={t('filters.acceptsExchange')} onChange={(v) => setDraft((d) => ({ ...d, acceptsExchange: v }))} testID="filters.accepts-exchange" value={draft.acceptsExchange} />
    </BottomSheet>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" variant="bodyStrong">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Chip de escolha (§3.1): 40 visível, alvo de 48; selecionado = fundo + borda 2 + check (não só cor). */
export function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      hitSlop={theme.space[1]}
      onPress={() => {
        void haptic('selection');
        onPress();
      }}
      style={[styles.chip, selected && styles.chipSelected]}
      testID={testID}
    >
      {selected ? <Check color={theme.color.text.brand} size={theme.size.iconSm} weight="bold" /> : null}
      <Text color={selected ? 'brand' : 'primary'} variant="bodyStrong">
        {label}
      </Text>
    </Pressable>
  );
}

function SwitchRow({ label, value, onChange, testID }: { label: string; value: boolean; onChange: (v: boolean) => void; testID: string }) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.flex}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        onValueChange={(v) => {
          void haptic('selection');
          onChange(v);
        }}
        thumbColor={theme.color.surface.card}
        trackColor={{ false: theme.color.border.strong, true: theme.color.action.primary }}
        testID={testID}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: theme.space[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] },
  priceRow: { flexDirection: 'row', gap: theme.space[3] },
  flex: { flex: 1 },
  chip: { minHeight: theme.size.controlSm, flexDirection: 'row', alignItems: 'center', gap: theme.space[1], paddingHorizontal: theme.space[4], borderRadius: theme.radius.full, backgroundColor: theme.color.surface.sunken, borderWidth: theme.borderWidth.strong, borderColor: 'transparent' },
  chipSelected: { backgroundColor: theme.color.surface.brandSubtle, borderColor: theme.color.border.focus },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space[3], minHeight: theme.size.touchMin },
});
