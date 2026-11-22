'use client';

import { Clock } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/panel/page-header';
import { useSession } from '@/components/panel/session-context';
import { Banner, Button, MessageState, NoAccessState, SkeletonRows, cx, useToast } from '@/components/ui';
import { viewAsApi, viewAsKeys } from '@/lib/api/view-as';
import { asRoute } from '@/lib/routes';
import { clearStoredReasons } from '@/lib/stored-reasons';
import { useOnline } from '@/lib/use-online';
import { ViewAsBanner, T } from './banner';
import { KEEPS_RUNNING, OnlyMerchantTag } from './boundary';
import { OpenViewAsDialog } from './open-dialog';
import { ExchangesScreen, MoreScreen, OrdersScreen, ProductsScreen, ReviewsScreen, StoreDataScreen } from './screens';
import { useRemaining, useViewAsState } from './use-view-as';
import type { ViewAsTab } from './view-as-tabs';
import { VIEW_AS_TITLES } from './view-as-tabs';
import s from './view-as.module.css';


/** Tela terminal: sem banner e sem nenhum dado da loja na tela (spec 4.4). O foco vai ao título e o leitor anuncia o texto. */
function EndedScreen({ storeId, replaced, onReopen }: { storeId: string; replaced: boolean; onReopen: () => void }) {
  return (
    <>
      <PageHeader title="Ver como o lojista" />
      <div role="status" data-testid={T('ended')}>
        <MessageState icon={Clock} title="A visualização terminou" text="Por segurança, ela dura 30 minutos e não renova. Abra de novo para continuar. A nova abertura fica registrada com o motivo." focusTitle>
          {replaced ? <p className={cx('wb-text-body', s.help)}>Você abriu outra visualização.</p> : null}
          <Button onClick={onReopen} data-testid={T('reopen')}>Abrir de novo</Button>
          <Link href={asRoute(`/admin/lojas/${storeId}`)} className="wb-text-body-strong" data-testid={T('back-to-store')}>
            Voltar para a ficha da loja
          </Link>
        </MessageState>
      </div>
    </>
  );
}

/** Rótulo da barra: itens fora da lista fechada são texto inerte com etiqueta, sem link e sem foco. */
function FrameNav({ storeId, tab }: { storeId: string; tab: ViewAsTab }) {
  const inMais = tab === 'mais' || tab === 'troca' || tab === 'aval' || tab === 'loja';
  const link = (aba: ViewAsTab, label: string, current: boolean) => (
    <li key={aba}>
      <Link href={asRoute(`/admin/lojas/${storeId}/ver-como?aba=${aba}`)} className={cx(s.navItem, 'wb-text-body-strong')} aria-current={current ? 'page' : undefined} data-testid={T(`nav-${aba}`)}>
        {label}
      </Link>
    </li>
  );
  const off = (label: string) => (
    <li key={label} className={s.navOff} data-testid={T('nav-off')}>
      <span className="wb-text-body-strong">{label}</span>
      <OnlyMerchantTag />
    </li>
  );
  return (
    <nav aria-label="Menu do lojista">
      <ul className={cx(s.nav, s.list)} style={{ flexDirection: 'row' }}>
        {off('Início')}
        {link('ped', 'Pedidos', tab === 'ped')}
        {link('prod', 'Produtos', tab === 'prod')}
        {off('Financeiro')}
        {link('mais', 'Mais', inMais)}
      </ul>
    </nav>
  );
}

/** Telas da visão "Ver como o lojista" (WB-352): moldura do lojista, somente leitura, com banner e relógio. */
export function ViewAsPage({ storeId, tab }: { storeId: string; tab: ViewAsTab }) {
  const { can } = useSession();
  const client = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const online = useOnline();
  const state = useViewAsState();
  const [ownId, setOwnId] = useState<string | null>(null);
  const [forcedEnd, setForcedEnd] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [reopen, setReopen] = useState(false);

  const data = state.data;
  const mine = Boolean(data?.active && data.storeId === storeId);
  const remaining = useRemaining(mine ? data?.expiresAt : undefined);
  const replaced = ownId !== null && Boolean(data?.active) && data?.id !== ownId;
  const active = mine && !replaced && remaining > 0 && !forcedEnd;

  // Guarda qual visão ESTA aba abriu (ajuste durante a renderização, como a documentação do React recomenda).
  if (mine && data?.id && ownId === null && !forcedEnd) setOwnId(data.id);

  // Fim da visão: nenhum dado da loja fica na memória nem na tela (C11).
  useEffect(() => {
    if (state.isSuccess && !active) client.removeQueries({ queryKey: viewAsKeys.scope(storeId) });
  }, [state.isSuccess, active, client, storeId]);

  const onExpired = useCallback(() => {
    setForcedEnd(true);
    void client.invalidateQueries({ queryKey: viewAsKeys.state });
  }, [client]);

  async function exit() {
    setExiting(true);
    clearStoredReasons();
    try {
      await viewAsApi.end();
    } catch {
      /* o BFF apaga o cookie de qualquer jeito; a validade de 30 min corre no servidor */
    }
    client.removeQueries({ queryKey: viewAsKeys.scope(storeId) });
    await client.invalidateQueries({ queryKey: viewAsKeys.state });
    toast.show('Visualização encerrada.');
    router.push(asRoute(`/admin/lojas/${storeId}`));
  }

  if (!can('view-as:open')) return <NoAccessState />;
  if (state.isPending) return <SkeletonRows rows={5} height={72} label="Carregando" />;

  const storeName = data?.storeName ?? null;
  if (!active) {
    return (
      <>
        <EndedScreen storeId={storeId} replaced={replaced} onReopen={() => setReopen(true)} />
        {reopen ? (
          <OpenViewAsDialog
            storeId={storeId}
            storeName={storeName ?? 'a loja'}
            hasOpen={false}
            reopen
            onClose={() => setReopen(false)}
            onOpened={() => {
              setReopen(false);
              setForcedEnd(false);
              setOwnId(null);
              void client.invalidateQueries({ queryKey: viewAsKeys.state });
            }}
          />
        ) : null}
      </>
    );
  }

  const screen = { storeId, onExpired };
  return (
    <div className={s.scope} data-testid={T('page')}>
      <PageHeader title={VIEW_AS_TITLES[tab]} eyebrow="Como o lojista vê" />
      <ViewAsBanner storeName={storeName ?? 'a loja'} expiresAt={data!.expiresAt!} exiting={exiting} onExit={() => void exit()} />
      <FrameNav storeId={storeId} tab={tab} />
      {!online ? <Banner tone="warning" offline>{KEEPS_RUNNING}</Banner> : null}
      {tab === 'ped' ? <OrdersScreen {...screen} /> : null}
      {tab === 'prod' ? <ProductsScreen {...screen} /> : null}
      {tab === 'troca' ? <ExchangesScreen {...screen} /> : null}
      {tab === 'aval' ? <ReviewsScreen {...screen} /> : null}
      {tab === 'loja' ? <StoreDataScreen {...screen} /> : null}
      {tab === 'mais' ? <MoreScreen storeId={storeId} /> : null}
    </div>
  );
}


