'use client';

import { useState } from 'react';
import { Banner, TextField, cx, ui } from '@/components/ui';
import { tid } from '@/lib/testid';
import { estimateEta, maxReachKm, type EtaParams } from './catalog';

const T = (id: string) => tid('parametros', id);
const num = (value: number) => String(value).replace('.', ',');
const parse = (text: string): number | null => {
  const n = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * "E se...?" do prazo de entrega: o admin digita uma distância (e, se quiser, o preparo de uma loja) e vê a conta e a faixa com os valores
 * que estão SALVOS. Também avisa quando o raio máximo de entrega passa do alcance do teto (a loja sumiria para esse endereço).
 */
export function EtaSimulator({ cfg, radiusMaxKm }: { cfg: EtaParams; radiusMaxKm?: number | null }) {
  const [km, setKm] = useState('5');
  const [prep, setPrep] = useState('');
  const kmN = parse(km);
  const prepN = prep.trim() === '' ? undefined : (parse(prep) ?? undefined);
  const result = kmN === null ? null : estimateEta(cfg, kmN, prepN);
  const reach = maxReachKm(cfg, prepN);
  return (
    <section className={cx(ui.card, ui.stack)} aria-labelledby="eta-sim" data-testid={T('eta-simulator')}>
      <h2 id="eta-sim" className="wb-text-title2" style={{ margin: 0 }}>Simulador do prazo</h2>
      <p className="wb-text-caption" style={{ margin: 0 }}>Usa os valores salvos: preparo + espera do despacho + deslocamento (distância em linha reta x {num(cfg.routeFactorPct / 100)} x {num(cfg.minPerKm)} min por km). O cliente sempre vê uma faixa.</p>
      <div className={ui.row} style={{ alignItems: 'flex-end' }}>
        <TextField label="Distância (km)" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} error={kmN === null ? 'Digite a distância em km.' : undefined} data-testid={T('eta-km')} />
        <TextField label="Preparo da loja (min, opcional)" inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value)} hint={`Vazio usa o padrão de ${cfg.prepMin} min`} data-testid={T('eta-prep')} />
      </div>
      {result ? (
        <div role="status" aria-live="polite" data-testid={T('eta-result')}>
          <p className="wb-text-body" style={{ margin: 0 }}>
            {result.prepMin} min de preparo + {result.dispatchMin} min de despacho + {result.travelMin} min de deslocamento = <strong>{result.estimateMin} min</strong>
          </p>
          {result.withinCeiling ? (
            <p className="wb-text-body-strong" style={{ margin: 0 }} data-testid={T('eta-band')}>Faixa mostrada: de {result.fromMin} a {result.toMin} min</p>
          ) : (
            <Banner tone="warning" testId={T('eta-outside')}>Passa do teto de {cfg.maxMin} min: a loja não entrega para esse endereço (fora da área).</Banner>
          )}
        </div>
      ) : null}
      <p className="wb-text-caption" style={{ margin: 0 }} data-testid={T('eta-reach')}>Com estes valores, o alcance máximo é de {num(reach)} km em linha reta.</p>
      {radiusMaxKm !== null && radiusMaxKm !== undefined && radiusMaxKm > reach ? (
        <Banner tone="warning" testId={T('eta-radius-warning')}>O raio máximo de entrega ({num(radiusMaxKm)} km) passa do alcance do teto. Lojas com mais de {num(reach)} km do cliente deixam de aparecer. Reduza o raio ou aumente o teto.</Banner>
      ) : null}
    </section>
  );
}
