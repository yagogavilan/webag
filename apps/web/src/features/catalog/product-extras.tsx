'use client';

import { Scales } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Banner, Button, Dialog, Switch, TextArea, TextField, cx, ui } from '@/components/ui';
import { useMerchant } from '@/features/lojista/store-context';
import type { ProductFormValues } from '@/lib/catalog/form';
import { pctText, priceToReceive, worstProviderFeePct, youReceive } from '@/lib/catalog/receive';
import { formatCents } from '@/lib/format';
import { canSeeSalesValues } from '@/lib/lojista-access';
import { centsFromDigits, moneyField } from '@/lib/money';
import { ltid } from '@/lib/testid';

const T = (id: string) => ltid('produto', id);
const SIZE_CHART_MAX = 2000;

/** Atraso de 300 ms para a linha "Você recebe" acompanhar a digitação sem piscar (onda-5c A1). */
function useDebounced<T>(value: T, ms = 300): T {
  const [state, setState] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setState(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return state;
}

/** "reais e centavos" para o leitor de tela. */
function spoken(cents: number): string {
  const reais = Math.floor(cents / 100);
  const rest = cents % 100;
  return `${reais} ${reais === 1 ? 'real' : 'reais'}${rest ? ` e ${rest} centavos` : ''}`;
}

/**
 * Preço sem conta de cabeça (DEC-035): o preço cadastrado já tem a comissão dentro; a linha mostra quanto cai para a loja.
 * Quem não é o dono e não tem `vendas_valores` vê só a ajuda, sem valor nem percentual (RN-13). Sem o percentual da loja
 * (pendência de contrato), a linha avisa que não calculou e NUNCA bloqueia a publicação.
 */
export function ReceiveLines({ priceCents, promoCents, onUsePrice }: { priceCents: number | null; promoCents: number | null; onUsePrice: (cents: number) => void }) {
  const { store } = useMerchant();
  const [calc, setCalc] = useState(false);
  const [how, setHow] = useState(false);
  const price = useDebounced(priceCents);
  const promo = useDebounced(promoCents);
  const data = store.data;
  const help = 'O preço que você cadastra é o que o cliente paga. A comissão da Webag já está dentro dele.';
  if (!canSeeSalesValues(data)) {
    return (
      <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }} data-testid={T('price-hint')}>
        O preço deve incluir a comissão da Webag.
      </p>
    );
  }
  const pct = data?.commissionPct ?? null;
  const feePct = worstProviderFeePct(data?.providerFeePct);
  const main = price && pct !== null ? youReceive(price, pct, feePct) : null;
  return (
    <div className={ui.stack}>
      <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }} data-testid={T('price-hint')}>
        {help}{' '}
        <button type="button" className="wb-text-caption-strong" onClick={() => setHow(true)} style={{ background: 'none', border: 0, padding: 0, minHeight: 44, color: 'var(--wb-color-text-link)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }} data-testid={T('receive-how-link')}>
          Como funciona
        </button>
      </p>
      <div role="status" aria-live="polite" style={{ padding: 12, borderRadius: 12, background: 'var(--wb-color-surface-sunken)', display: 'grid', gap: 2 }} data-testid={T('receive-line')}>
        {pct === null ? (
          <p className="wb-text-caption" style={{ margin: 0 }} data-testid={T('receive-unavailable')}>Não conseguimos calcular agora. Você pode publicar e conferir depois.</p>
        ) : !price || !main ? (
          <p className="wb-text-caption" style={{ margin: 0 }}>Informe o preço para ver quanto você recebe.</p>
        ) : (
          <>
            <p className="wb-text-body-strong" style={{ margin: 0 }} aria-label={`Você recebe, estimado, ${spoken(main.receive)}`} data-testid={T('receive-value')}>Você recebe {formatCents(main.receive)} <span className="wb-text-caption">(estimado)</span></p>
            <p className="wb-text-caption" style={{ margin: 0 }} data-testid={T('receive-commission')}>Comissão da Webag: {pctText(pct)} ({formatCents(main.commission)}).</p>
            {feePct > 0 ? (
              <p className="wb-text-caption" style={{ margin: 0 }} data-testid={T('receive-fee')}>Tarifa do Mercado Pago: até {pctText(feePct)} ({formatCents(main.fee)}), pela forma de pagamento mais cara.</p>
            ) : (
              <p className="wb-text-caption" style={{ margin: 0 }} data-testid={T('receive-fee')}>A tarifa do Mercado Pago é descontada à parte.</p>
            )}
            {promo ? <p className="wb-text-caption" style={{ margin: 0 }} data-testid={T('receive-promo-line')}>Na promoção você recebe {formatCents(youReceive(promo, pct, feePct).receive)}.</p> : null}
            <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }} data-testid={T('receive-estimate-note')}>
              Valor estimado: a tarifa real depende de como o cliente paga e aparece no seu extrato.
            </p>
          </>
        )}
      </div>
      {pct !== null ? (
        <div>
          <Button variant="text" onClick={() => setCalc(true)} data-testid={T('receive-calc-link')}>Quero receber um valor</Button>
        </div>
      ) : null}
      {calc && pct !== null ? <CalcDialog pct={pct} feePct={feePct} onClose={() => setCalc(false)} onUse={(cents) => { onUsePrice(cents); setCalc(false); }} /> : null}
      {how ? (
        <Dialog title="Como funciona" onClose={() => setHow(false)} testId={T('receive-how-sheet')} actions={<Button size="lg" onClick={() => setHow(false)}>Entendi</Button>}>
          <p className="wb-text-body" style={{ margin: 0 }}>Exemplo: preço R$ 100,00, menos a comissão {pct === null ? '' : `(${pctText(pct)}) `}e a tarifa do Mercado Pago, é o valor que você recebe.</p>
          <p className="wb-text-body" style={{ margin: 0 }}>A Webag retém a comissão de cada venda. O percentual da sua loja é definido pela Webag. Vale a comissão do dia da venda.</p>
          <p className="wb-text-body" style={{ margin: 0 }}>A tarifa do Mercado Pago também sai do seu valor. Para não errar para menos, a conta usa a forma de pagamento mais cara (PIX ou cartão). O extrato mostra a tarifa real de cada venda.</p>
        </Dialog>
      ) : null}
    </div>
  );
}

function CalcDialog({ pct, feePct, onClose, onUse }: { pct: number; feePct: number; onClose: () => void; onUse: (cents: number) => void }) {
  const [wanted, setWanted] = useState<number | null>(null);
  const [error, setError] = useState<string | undefined>();
  const price = wanted ? priceToReceive(wanted, pct, feePct) : null;
  return (
    <Dialog
      title="Quanto você quer receber?"
      onClose={onClose}
      testId={T('receive-calc')}
      actions={
        <>
          <Button size="lg" onClick={() => (price ? onUse(price) : setError('Digite quanto quer receber.'))} data-testid={T('receive-calc-apply')}>Usar este preço</Button>
          <Button size="lg" variant="secondary" onClick={onClose}>Cancelar</Button>
        </>
      }
    >
      <TextField label="Quanto você quer receber (R$)" inputMode="numeric" placeholder="0,00" value={moneyField(wanted)} onChange={(event) => { const cents = centsFromDigits(event.target.value); setWanted(cents === 0 ? null : cents); setError(undefined); }} error={error} data-testid={T('receive-calc-input')} />
      {price && wanted ? <p className="wb-text-body-strong" style={{ margin: 0 }} data-testid={T('receive-calc-result')}>Cobre {formatCents(price)} para receber {formatCents(wanted)}</p> : null}
    </Dialog>
  );
}

/** A2: "sem troca por tamanho ou cor". Desistência em 7 dias e defeito continuam por lei: o lojista não consegue desligar. */
export function ExchangeSection({ values, set }: { values: ProductFormValues; set: <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => void }) {
  const on = !values.noVoluntaryExchange;
  return (
    <section className={ui.stack} aria-labelledby="prod-exchange" data-testid={T('exchange-section')}>
      <h2 id="prod-exchange" className="wb-text-title2" style={{ margin: 0 }}>Troca</h2>
      <Switch checked={on} onChange={(next) => set('noVoluntaryExchange', !next)} label="Aceita troca por tamanho ou cor" onText="Ligado" offText="Desligado" testId={T('exchange-switch')} />
      {on ? null : <p className="wb-text-caption" style={{ margin: 0 }} data-testid={T('exchange-preview')}>Como o cliente vê: Sem troca por tamanho ou cor neste produto.</p>}
      <Banner tone="info" testId={T('exchange-legal-card')}>
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'flex-start' }}>
          <Scales size={24} aria-hidden="true" />
          <span>Desistência em 7 dias e defeito continuam valendo por lei. Você não pode desligar.</span>
        </span>
      </Banner>
    </section>
  );
}

/** A3: tabela de medidas. A API guarda texto livre (até 2.000); só faz sentido com a opção Tamanho. */
export function SizeChartSection({ values, set, hasSize }: { values: ProductFormValues; set: <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => void; hasSize: boolean }) {
  return (
    <section className={ui.stack} aria-labelledby="prod-sizechart" data-testid={T('sizechart-section')}>
      <h2 id="prod-sizechart" className="wb-text-title2" style={{ margin: 0 }}>Tabela de medidas (opcional)</h2>
      {hasSize ? null : (
        <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }} data-testid={T('sizechart-disabled-note')}>
          Disponível quando o produto tem a opção Tamanho.
        </p>
      )}
      <TextArea
        label="Medidas por tamanho"
        value={values.sizeChart}
        disabled={!hasSize}
        rows={5}
        maxLength={SIZE_CHART_MAX}
        counter={{ value: values.sizeChart.length, max: SIZE_CHART_MAX }}
        placeholder={'P: largura 50 cm, comprimento 68 cm\nM: largura 53 cm, comprimento 70 cm'}
        hint="Diga se as medidas são da peça ou do corpo. Uma tabela ajuda o cliente a escolher o tamanho certo."
        onChange={(event) => set('sizeChart', event.target.value.slice(0, SIZE_CHART_MAX))}
        data-testid={T('sizechart-input')}
      />
    </section>
  );
}
