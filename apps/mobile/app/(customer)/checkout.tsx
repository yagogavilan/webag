import type { CheckoutChange } from '@webag/shared';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner } from '../../src/components/Banner';
import { Button } from '../../src/components/Button';
import { Header } from '../../src/components/Header';
import { Handbag, Lock } from '../../src/components/icons';
import { Screen } from '../../src/components/Screen';
import { Skeleton } from '../../src/components/Skeleton';
import { EmptyState, ErrorState } from '../../src/components/StateViews';
import { Text } from '../../src/components/Text';
import { TextField } from '../../src/components/TextField';
import { useToast } from '../../src/components/Toast';
import { useCurrentAddress } from '../../src/features/address/store';
import { fromServer } from '../../src/features/cart/model';
import { PriceSummary } from '../../src/features/cart/PriceSummary';
import { formatOpensAt } from '../../src/features/catalog/format';
import { modeStore } from '../../src/features/catalog/queries';
import { ChangedSheet } from '../../src/features/checkout/ChangedSheet';
import { EtaChangedSheet } from '../../src/features/checkout/EtaChangedSheet';
import type { EtaLike } from '../../src/features/catalog/eta';
import { isCheckoutEnabled, isSecureCardUrl } from '../../src/features/checkout/config';
import { openExternal } from '../../src/features/legal/open-link';
import { cardIntentMemory } from '../../src/features/checkout/card-intent';
import { startCardIntent } from '../../src/api/orders-api';
import { ApiError } from '../../src/api/problem';
import { toCheckoutFailure, type CheckoutFailure } from '../../src/features/checkout/errors';
import { MaintenanceBanner } from '../../src/features/maintenance/MaintenanceBanner';
import { maintenanceText } from '../../src/features/maintenance/model';
import { useCheckoutCart, useGuestMergePending, useSubmitOrder } from '../../src/features/checkout/hooks';
import { PaymentBlock } from '../../src/features/checkout/PaymentBlock';
import { ReceiveBlock } from '../../src/features/checkout/ReceiveBlock';
import { addressIsReady, deriveGate, payLabel, pendingChanges, type PayMethod, type ReceiveMode } from '../../src/features/checkout/state';
import { t } from '../../src/i18n';
import { formatMoney } from '../../src/lib/format';
import { haptic } from '../../src/lib/haptics';
import { isValidCpf, maskCpf, onlyDigits } from '../../src/lib/masks';
import { useOnline } from '../../src/lib/useOnline';
import { theme } from '../../src/theme';

/**
 * S3. Checkout em 1 tela (WB-023, 026): como receber, como pagar, resumo sem surpresa e um botão. O total é o do servidor
 * (`summary`); o pedido só sai com `cartRevision` e `Idempotency-Key`. DEC-033: só roda fora de produção.
 */
export default function CheckoutScreen() {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const address = useCurrentAddress();
  const [mode, setMode] = useState<ReceiveMode>(() => modeStore.get());
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [methodError, setMethodError] = useState<string | null>(null);
  const [cpf, setCpf] = useState('');
  const [cpfError, setCpfError] = useState<string | null>(null);
  const [needsCpf, setNeedsCpf] = useState(false);
  const [failure, setFailure] = useState<CheckoutFailure | null>(null);
  const [changedOpen, setChangedOpen] = useState(false);
  // 409 ETA_CHANGED (WB-261): faixa vista na sacola x faixa nova do servidor; nenhum pedido foi criado
  const [etaChange, setEtaChange] = useState<{ before: EtaLike | null; after: EtaLike | null } | null>(null);
  // fim da faixa que o cliente aceitou na folha "O horário mudou"; vai em `acceptedEtaToAt` até o modo mudar
  const acceptedEta = useRef<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);
  const [serverChanges, setServerChanges] = useState<CheckoutChange[]>([]);
  const cart = useCheckoutCart(mode);
  const mergePending = useGuestMergePending();
  const { submit, submitting, slow } = useSubmitOrder();
  const openedChanges = useRef(false);

  const view = cart.cart ? fromServer(cart.cart) : null;
  const changes = cart.cart ? pendingChanges(cart.cart) : [];

  // Conferência ao abrir (RN-05): se a sacola já chegou com preço ou estoque mudados, o cliente vê antes de pagar.
  useEffect(() => {
    if (!openedChanges.current && changes.length > 0 && !cart.isFetching) {
      openedChanges.current = true;
      setChangedOpen(true);
    }
  }, [changes.length, cart.isFetching]);

  const header = <Header title={t('checkout.title')} {...(view ? { subtitle: view.storeName } : {})} />;

  if (!isCheckoutEnabled()) {
    return (
      <Screen header={header}>
        <EmptyState actionLabel={t('checkout.backToCart')} icon={Handbag} onAction={() => router.back()} testID="checkout.disabled" text={t('checkout.disabledText')} title={t('checkout.disabledTitle')} />
      </Screen>
    );
  }
  if (!cart.authed) {
    return (
      <Screen header={header}>
        <EmptyState actionLabel={t('login.submit')} icon={Handbag} onAction={() => router.replace({ pathname: '/signup', params: { returnTo: '/checkout', context: 'checkout' } })} testID="checkout.guest" text={t('checkout.guestNeedsLogin')} title={t('checkout.title')} />
      </Screen>
    );
  }
  if (mergePending || (cart.isLoading && !cart.cart)) {
    return (
      <Screen header={header} testID="checkout.skeleton">
        {mergePending ? <Text color="secondary">{t('checkout.mergePending')}</Text> : null}
        <Skeleton height={48} />
        <Skeleton height={72} />
        <Skeleton height={72} />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton height={20} key={i} />
        ))}
      </Screen>
    );
  }
  if (cart.isError) {
    return (
      <Screen header={header}>
        <ErrorState offline={!online} onRetry={cart.refetch} retryLabel={t('common.tryAgain')} testID="checkout.error" text={online ? t('checkout.checkFailed') : t('states.offlineText')} title={online ? t('states.errorTitle') : t('states.offlineTitle')} />
      </Screen>
    );
  }
  if (!cart.cart || !view) {
    // não existe checkout vazio: volta para a sacola vazia (spec S3, Vazio)
    return (
      <Screen header={header}>
        <EmptyState actionLabel={t('cart.emptyAction')} icon={Handbag} onAction={() => router.replace('/')} testID="checkout.empty" text={t('checkout.emptyCartText')} title={t('checkout.emptyCartTitle')} />
      </Screen>
    );
  }

  const gate = deriveGate(view, mode, address);
  const summary = view.summary;
  const total = cart.cart.summary.total.amount;
  const label =
    gate.kind !== 'ready'
      ? (gate.label ?? t('checkout.backToCart'))
      : method === null
        ? t('checkout.choosePay')
        : submitting
          ? method === 'pix'
            ? t('checkout.generatingPix')
            : t('checkout.paying')
          : method === 'card'
            ? t('checkout.payCardSecure', { total: formatMoney(total) })
            : payLabel(method, total);

  const onFailure = (f: CheckoutFailure) => {
    void haptic('error');
    switch (f.kind) {
      case 'offline':
        toast.show(t('checkout.offlinePay'));
        return;
      case 'cart-changed':
        if (f.cart) cart.apply(f.cart);
        setServerChanges(f.changes);
        setChangedOpen(true);
        return;
      case 'eta-changed':
        setEtaChange({ before: view?.eta ?? null, after: f.eta });
        return;
      case 'payer-document':
        setNeedsCpf(true);
        setCpfError(null);
        return;
      default:
        setFailure(f);
    }
  };

  const onPay = async () => {
    if (gate.kind === 'address' || gate.kind === 'range') {
      router.push(address ? { pathname: '/address/form', params: { id: address.id, from: 'addresses' } } : '/addresses');
      return;
    }
    if (gate.kind === 'back') return router.replace('/cart');
    if (gate.kind === 'closed') return;
    if (!online) {
      toast.show(t('checkout.offlinePay'));
      return;
    }
    if (changes.length > 0) {
      setChangedOpen(true);
      return;
    }
    if (method === null) {
      void haptic('error');
      setMethodError(t('checkout.choosePayError'));
      return;
    }
    if (needsCpf && !isValidCpf(cpf)) {
      setCpfError(t('checkout.cpfInvalid'));
      return;
    }
    setFailure(null);
    if (method === 'card') return void onCard();
    const result = await submit(cart.cart as NonNullable<typeof cart.cart>, {
      mode,
      addressId: address && addressIsReady(address) ? address.id : null,
      method,
      // WB-261: o fim da faixa que o cliente viu (o aceito na folha, se houve; senão o da sacola)
      acceptedEtaToAt: acceptedEta.current ?? cart.cart?.delivery?.eta?.toAt ?? null,
      ...(needsCpf ? { payerDocument: onlyDigits(cpf) } : {}),
    });
    if ('ignored' in result) return;
    if (!result.ok) return onFailure(result.failure);
    void haptic('success');
    router.replace({ pathname: '/pay/[orderId]', params: { orderId: result.order.id } } as never);
  };

  /** Cartão: o app NUNCA toca em dado de cartão. Pede a intenção ao servidor (o total que o cliente viu, SEC-147) e abre a página segura. */
  const onCard = async () => {
    const current = cart.cart;
    if (!current || cardBusy) return;
    setCardBusy(true);
    try {
      const intent = await startCardIntent({
        mode,
        ...(mode === 'delivery' && address && addressIsReady(address) ? { addressId: address.id } : {}),
        cartRevision: current.revision,
        expectedTotalCents: current.summary.total.amount,
        ...(needsCpf ? { payerDocument: onlyDigits(cpf) } : {}),
      });
      // A URL vem da API, mas só a página segura do Webag (mesma origem, rota fixa) é aberta: qualquer outra é recusada (SEC-126)
      if (!isSecureCardUrl(intent.url)) {
        toast.show(t('cardWait.notOpened'));
        return;
      }
      if (!(await openExternal(intent.url, 'card'))) {
        toast.show(t('cardWait.notOpened'));
        return;
      }
      cardIntentMemory.set({ url: intent.url, startedAt: Date.now(), expiresAt: new Date(intent.expiresAt).getTime() });
      void haptic('light');
      router.push('/card-wait' as never);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PAYER_DOCUMENT_REQUIRED') return onFailure({ kind: 'payer-document' });
      onFailure(toCheckoutFailure(e));
    } finally {
      setCardBusy(false);
    }
  };

  const onAccept = async () => {
    setAccepting(true);
    try {
      await cart.accept();
      void haptic('success');
      setChangedOpen(false);
    } catch {
      toast.show(t('cart.editError'));
    } finally {
      setAccepting(false);
    }
  };

  const onEtaAccept = async () => {
    setAccepting(true);
    try {
      // a faixa nova passa a ser a da sacola; o cliente já viu o horário e toca em Pagar de novo, agora com `acceptedEtaToAt` = faixa nova
      const fresh = await cart.reload();
      acceptedEta.current = etaChange?.after?.toAt ?? fresh.delivery?.eta?.toAt ?? null;
      void haptic('success');
      setEtaChange(null);
    } catch {
      toast.show(t('etaChanged.failed'));
    } finally {
      setAccepting(false);
    }
  };

  const failureBanner = failure ? <FailureBanner failure={failure} onChangeCard={() => setFailure(null)} onPix={() => {
          setFailure(null);
          setMethod('pix');
        }} onBackToCart={() => router.replace('/cart')} onVerify={() => router.push('/verify-email')} /> : null;

  const footer = (
    <View style={styles.footer}>
      {failure?.kind === 'maintenance' ? null : <MaintenanceBanner testID="checkout.maintenance-notice" />}
      {gate.banner ? <Banner testID={gate.banner.testID} text={gate.banner.text} tone={gate.banner.tone} /> : null}
      {failureBanner}
      {submitting && slow ? (
        <Text accessibilityLiveRegion="polite" color="secondary" testID="checkout.slow" variant="caption">
          {t('checkout.stillGenerating')}
        </Text>
      ) : null}
      <Button disabled={gate.inert} label={label} loading={submitting || cardBusy} muted={gate.kind === 'ready' && method === null} onPress={() => void onPay()} size="lg" testID="checkout.submit" />
    </View>
  );

  return (
    <Screen footer={footer} header={header} testID="checkout.screen">
      <ReceiveBlock
        address={address}
        etaMax={view.etaMax}
        etaMin={view.etaMin}
        mode={mode}
        onChangeAddress={() => router.push('/addresses')}
        onModeChange={(next) => {
          setMode(next);
          acceptedEta.current = null;
          setFailure(null);
        }}
        ready={addressIsReady(address)}
      />
      <PaymentBlock
        cardAvailable
        cardForm={
          <View accessible style={styles.secureNote} testID="checkout.card-secure-note">
            <Lock color={theme.color.action.primary} duo={theme.color.brand[300]} size={24} weight="duotone" />
            <Text style={styles.secureText} variant="caption">
              {t('cardWait.notice')}
            </Text>
          </View>
        }
        cpfField={
          needsCpf ? (
            <TextField
              autoComplete="off"
              error={cpfError ?? undefined}
              help={t('checkout.cpfHelp')}
              inputMode="numeric"
              label={t('checkout.cpfLabel')}
              mask={maskCpf}
              onChangeText={(value) => {
                setCpf(value);
                setCpfError(null);
              }}
              testID="checkout.cpf-input"
              value={cpf}
            />
          ) : null
        }
        method={method}
        onMethodChange={(next) => {
          setMethod(next);
          setMethodError(null);
        }}
      />
      {methodError ? <Banner testID="checkout.method-error" text={methodError} tone="warning" /> : null}
      <View style={styles.summary} testID="checkout.summary">
        {cart.checkFailed ? <Banner testID="checkout.check-error" text={t('checkout.checkFailed')} tone="warning" actionLabel={t('common.tryAgain')} onAction={cart.refetch} /> : null}
        {summary ? <PriceSummary couponCode={view.coupon?.applied ? view.coupon.code : undefined} pickup={mode === 'pickup'} summary={summary} /> : null}
      </View>
      <EtaChangedSheet
        accepting={accepting}
        after={etaChange?.after ?? null}
        before={etaChange?.before ?? null}
        onAccept={() => void onEtaAccept()}
        onBack={() => {
          setEtaChange(null);
          router.replace('/cart');
        }}
        visible={etaChange !== null}
      />
      <ChangedSheet
        accepting={accepting}
        changes={changes.length > 0 ? changes : serverChanges}
        onAccept={() => void onAccept()}
        onBack={() => {
          setChangedOpen(false);
          router.replace('/cart');
        }}
        totalCents={total}
        visible={changedOpen}
      />
    </Screen>
  );
}

function FailureBanner({ failure, onBackToCart, onVerify, onChangeCard, onPix }: { failure: CheckoutFailure; onBackToCart: () => void; onVerify: () => void; onChangeCard: () => void; onPix: () => void }) {
  switch (failure.kind) {
    case 'declined':
      return (
        <View style={styles.summary}>
          <Banner testID="card.error-sheet" text={`${t('card.declinedTitle')} ${failure.reason ?? t('card.declinedDefault')} ${t('card.declinedHint')}`} tone="danger" />
          <Button label={t('card.changeCard')} onPress={onChangeCard} testID="card.change-card" />
          <Button label={t('card.payWithPix')} onPress={onPix} testID="card.pay-with-pix" variant="secondary" />
        </View>
      );
    case 'store-closed': {
      const when = formatOpensAt(failure.opensAt);
      return <Banner actionLabel={t('checkout.backToCart')} onAction={onBackToCart} testID="checkout.closed-banner" text={when ? t('checkout.closedBannerAt', { when }) : t('checkout.closedBanner')} tone="danger" />;
    }
    case 'stock':
      return <Banner actionLabel={t('checkout.backToCart')} onAction={onBackToCart} testID="checkout.stock-banner" text={failure.name ? t('checkout.stockOut', { name: failure.name }) : t('checkout.stockOutGeneric')} tone="danger" />;
    case 'email-unverified':
      return <Banner actionLabel={t('checkout.emailUnverifiedAction')} onAction={onVerify} testID="checkout.email-banner" text={t('checkout.emailUnverified')} tone="warning" />;
    case 'blocked':
      return <Banner actionLabel={t('checkout.backToCart')} onAction={onBackToCart} testID="checkout.blocked-banner" text={failure.message} tone="warning" />;
    case 'maintenance':
      return <Banner testID="checkout.maintenance-banner" text={`${t('maintenance.title')}. ${maintenanceText(failure.message, failure.expectedBackAt)} ${t('checkout.maintenanceNote')}`} tone="warning" />;
    case 'provider-down':
      return <Banner testID="checkout.error-banner" text={t('checkout.providerDown')} tone="danger" />;
    case 'key-reused':
      return <Banner testID="checkout.error-banner" text={t('checkout.keyReused')} tone="warning" />;
    case 'too-many':
      return <Banner testID="checkout.error-banner" text={t('checkout.tooMany')} tone="warning" />;
    default:
      return <Banner testID="checkout.error-banner" text={t('checkout.unknown')} tone="danger" />;
  }
}

const styles = StyleSheet.create({
  footer: { gap: theme.space[2] },
  summary: { gap: theme.space[2] },
  secureNote: { flexDirection: 'row', gap: theme.space[3], alignItems: 'center', backgroundColor: theme.color.surface.sunken, borderRadius: theme.radius.lg, padding: theme.space[3] },
  secureText: { flex: 1 },
});
