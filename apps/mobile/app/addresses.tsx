import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSession } from '../src/api/session';
import { Banner } from '../src/components/Banner';
import { Button } from '../src/components/Button';
import { Dialog } from '../src/components/Dialog';
import { Header } from '../src/components/Header';
import { Crosshair, DotsThree, MapPin } from '../src/components/icons';
import { RadioListItem } from '../src/components/RadioListItem';
import { Screen } from '../src/components/Screen';
import { Skeleton } from '../src/components/Skeleton';
import { EmptyState } from '../src/components/StateViews';
import { Text } from '../src/components/Text';
import { useToast } from '../src/components/Toast';
import { addressStore, useAddresses } from '../src/features/address/store';
import { addressArea, addressLine, MAX_ADDRESSES, type Address } from '../src/features/address/types';
import { t } from '../src/i18n';
import { haptic } from '../src/lib/haptics';
import { theme } from '../src/theme';

/** D3. Meus endereços e seletor "Entregar em" (WB-003). Tocar numa linha troca o endereço na hora, sem botão de confirmar. */
export default function AddressesScreen() {
  const router = useRouter();
  const toast = useToast();
  const session = useSession();
  const state = useAddresses();
  const [menuFor, setMenuFor] = useState<Address | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);
  const [limitMessage, setLimitMessage] = useState(false);
  const [needsChoice, setNeedsChoice] = useState(false);

  const full = state.status === 'ready' ? state.addresses.filter((a) => a.precision === 'full') : [];
  const approx = state.status === 'ready' ? state.addresses.find((a) => a.precision === 'approx') : undefined;
  const items = approx ? [approx, ...full] : full;
  const currentId = state.status === 'ready' ? state.currentId : null;

  const choose = async (address: Address) => {
    await addressStore.setCurrent(address.id);
    toast.show(t('address.deliveringTo', { place: addressLine(address) }));
    router.replace('/');
  };

  const add = () => {
    if (full.length >= MAX_ADDRESSES) {
      // o botão continua ativo e explica o limite (design D3)
      setLimitMessage(true);
      void haptic('warning');
      return;
    }
    router.push({ pathname: '/address/form', params: { from: 'addresses' } });
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    const { hasCurrent, wasCurrent } = await addressStore.remove(target.id);
    void haptic('success');
    toast.show(t('address.deleted'));
    const remaining = state.status === 'ready' ? state.addresses.filter((a) => a.id !== target.id).length : 0;
    if (remaining === 0) router.replace('/location');
    else if (wasCurrent && !hasCurrent) setNeedsChoice(true);
  };

  return (
    <Screen
      footer={items.length > 0 ? <Button label={t('address.add')} onPress={add} size="lg" testID="addresses.add" /> : undefined}
      header={<Header title={needsChoice ? t('address.chooseTitle') : t('address.pickTitle')} />}
    >
      {state.status === 'loading' ? (
        <View accessibilityLabel={t('common.loading')} style={styles.list}>
          {[0, 1, 2].map((i) => (
            <Skeleton height={72} key={i} />
          ))}
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          actionLabel={t('address.add')}
          icon={MapPin}
          onAction={add}
          testID="addresses.empty"
          text={t('address.pickEmptyText')}
          title={t('address.pickEmptyTitle')}
        />
      ) : (
        <View accessibilityLabel={`${t('address.pickTitle')}, ${items.length}`} accessibilityRole="radiogroup" style={styles.list} testID="addresses.sheet">
          {items.map((address) => (
            <RadioListItem
              accessibilityLabel={`${address.nickname ? `${t(`address.${address.nickname}`)}, ` : ''}${addressLine(address)}, ${addressArea(address)}${address.id === currentId ? `, ${t('address.current')}` : ''}`}
              key={address.id}
              onPress={() => void choose(address)}
              selected={address.id === currentId}
              subtitle={address.precision === 'approx' ? t('location.approx') : addressArea(address)}
              testID={`addresses.item-${address.id}`}
              title={`${address.nickname ? `${t(`address.${address.nickname}`)} · ` : ''}${addressLine(address)}`}
              trailing={
                address.precision === 'full' ? (
                  <Pressable
                    accessibilityLabel={t('address.menu')}
                    accessibilityRole="button"
                    hitSlop={theme.hitSlopFor(theme.size.iconMd)}
                    onPress={() => setMenuFor(address)}
                    style={styles.menu}
                    testID={`addresses.item-${address.id}-menu`}
                  >
                    <DotsThree color={theme.color.text.secondary} size={theme.size.iconMd} weight="bold" />
                  </Pressable>
                ) : null
              }
            />
          ))}
        </View>
      )}

      <Button
        icon={<Crosshair color={theme.color.text.brand} size={theme.size.iconSm} />}
        label={t('address.useGps')}
        onPress={() => router.push('/location')}
        testID="addresses.use-gps"
        variant="secondary"
      />
      {limitMessage ? <Banner testID="addresses.limit-message" text={t('address.limit')} tone="warning" /> : null}
      {session.status !== 'authenticated' ? (
        <Text color="secondary" variant="caption">
          {t('address.visitorNote')}
        </Text>
      ) : null}

      <Dialog onClose={() => setMenuFor(null)} title={menuFor ? addressLine(menuFor) : ''} visible={menuFor !== null}>
        <Button
          label={t('address.edit')}
          onPress={() => {
            const target = menuFor;
            setMenuFor(null);
            if (target) router.push({ pathname: '/address/form', params: { id: target.id, from: 'addresses' } });
          }}
          testID="addresses.edit"
          variant="secondary"
        />
        <Button
          label={t('address.delete')}
          onPress={() => {
            setDeleting(menuFor);
            setMenuFor(null);
          }}
          testID="addresses.delete"
          variant="secondary"
        />
        <Button label={t('common.cancel')} onPress={() => setMenuFor(null)} variant="text" />
      </Dialog>

      <Dialog onClose={() => setDeleting(null)} text={deleting ? addressLine(deleting) : ''} title={t('address.deleteTitle')} visible={deleting !== null}>
        <Button label={t('address.deleteConfirm')} onPress={() => void confirmDelete()} testID="addresses.delete-confirm" variant="destructive" />
        <Button label={t('common.cancel')} onPress={() => setDeleting(null)} variant="text" />
      </Dialog>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.space[3] },
  menu: { width: theme.size.touchMin, height: theme.size.touchMin, alignItems: 'center', justifyContent: 'center' },
});
