'use client';

import { BellRinging } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Banner, Switch, cx, ui, useToast } from '@/components/ui';
import { saveErrorMessage } from '@/lib/api/messages';
import { settingsApi, type StoreSettings } from '@/lib/api/store-settings';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { SettingsFrame } from './settings-frame';
import { SettingsScreen } from './settings-screen';

const T = (id: string) => ltid('avisos', id);

export function NotificationsPage() {
  return <SettingsScreen>{({ store, settings, refresh }) => <NotificationsForm storeId={store.id} current={settings.notifications} refresh={refresh} />}</SettingsScreen>;
}

/**
 * B2, WB-192: preferência de e-mail de pedido novo (só o dono). Desliga SÓ o e-mail: o alerta no painel e o som de pedido novo nunca
 * desligam (DEC-074a), e o texto diz isso nos dois estados para o lojista não entender que "desligou os avisos".
 */
export function NotificationsForm({ storeId, current, refresh }: { storeId: string; current: StoreSettings['notifications']; refresh: () => Promise<unknown> }) {
  const router = useRouter();
  const toast = useToast();
  const saved = current?.newOrderEmail !== false;
  const [on, setOn] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setFormError(null);
    try {
      await settingsApi.setNotifications(storeId, { newOrderEmail: on });
      await refresh();
      toast.show(on ? 'E-mail de pedido novo ligado.' : 'E-mail de pedido novo desligado. O alerta e o som no painel continuam.');
      router.push(asRoute('/lojista/loja'));
    } catch (caught) {
      setBusy(false);
      setFormError(saveErrorMessage(caught));
    }
  }

  return (
    <SettingsFrame screen="avisos" title="Avisos de pedido novo" description="Como você fica sabendo de um pedido novo quando o painel está fechado." dirty={on !== saved} busy={busy} submitLabel="Salvar" onSubmit={() => void submit()} error={formError}>
      <Switch checked={on} onChange={setOn} label="E-mail de pedido novo" onText="Ligado" offText="Desligado" testId={T('email-switch')} />
      <p className="wb-text-body" style={{ margin: 0 }} data-testid={T('email-what')}>
        Quando um pedido é pago, enviamos um e-mail ao dono e à equipe com permissão de pedidos, e um lembrete &quot;Aceite agora&quot; se o pedido ficar esperando. O e-mail traz o número do pedido, entrega ou retirada, até 5 itens e o horário limite para aceitar. Não leva nome, endereço, telefone nem valor.
      </p>
      <div className={cx(ui.card)} data-testid={T('always-on')} style={{ background: 'var(--wb-color-feedback-info-subtle)' }}>
        <div className={ui.row} style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <BellRinging size={24} aria-hidden="true" />
          <p className="wb-text-body-strong" style={{ margin: 0 }}>O alerta e o som de pedido novo no painel não desligam. Esta opção só controla o e-mail.</p>
        </div>
      </div>
      {!on ? (
        <Banner tone="warning" testId={T('off-warning')}>
          Com o e-mail desligado, se o painel estiver fechado você só vê o pedido ao abrir o painel. Pedido que não for aceito no prazo é cancelado e o cliente é estornado.
        </Banner>
      ) : null}
    </SettingsFrame>
  );
}
