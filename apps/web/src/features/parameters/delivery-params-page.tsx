'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { Lima } from '@/components/panel/blocks';
import { PageHeader } from '@/components/panel/page-header';
import { REASON_MAX, reasonError } from '@/components/panel/reason-dialog';
import { useSession } from '@/components/panel/session-context';
import { Banner, Button, NoAccessState, QueryBoundary, SelectField, TextArea, TextField, cx, ui, useToast } from '@/components/ui';
import { adminApi, keys, type Parameter } from '@/lib/api/admin';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { estimateEta, maxReachKm, parseInput, rangeText, toInput, unitOf, type EtaParams } from './catalog';
import s from './delivery-params.module.css';

const T = (id: string) => `admin.params.${id}`;

/**
 * Grupos da tela (`onda-7-paineis-v3.md` §4, WB-258). Cada campo é um parâmetro que já existe na API; a tela só os junta, valida a conta
 * antes de enviar e grava todos com o MESMO motivo (auditoria por parâmetro). Valores de partida: calibrar com os dados do piloto.
 */
const GROUPS = [
  { id: 'faixa', title: 'Conta da faixa', hint: 'Como o horário prometido é calculado: preparo + espera do motoboy + trajeto, com folga para mais e para menos.', keys: ['entrega_preparo_padrao_min', 'entrega_despacho_min', 'entrega_rota_fator_pct', 'entrega_min_por_km', 'entrega_faixa_min'] },
  { id: 'teto', title: 'Teto e alcance', hint: 'Até onde a Webag promete entregar. Acima do teto, a loja não aparece para aquele endereço.', keys: ['entrega_max_min', 'raio_max_km'] },
  { id: 'atraso', title: 'Atraso', hint: 'O que acontece quando a entrega passa do fim da faixa prometida.', keys: ['entrega_atraso_tolerancia_min', 'entrega_cancel_resposta_min', 'entrega_compensacao_tipo', 'entrega_compensacao_cents'] },
  { id: 'operacao', title: 'Operação', hint: 'Quando e como a logística despacha.', keys: ['entrega_lote_max', 'logistica_horario', 'logistica_dias'] },
] as const;
const ALL_KEYS: string[] = GROUPS.flatMap((group) => [...group.keys]);

const SHORT: Record<string, string> = {
  entrega_preparo_padrao_min: 'Preparo padrão da loja',
  entrega_despacho_min: 'Espera até o motoboy sair',
  entrega_rota_fator_pct: 'Fator de rota',
  entrega_min_por_km: 'Minutos por km',
  entrega_faixa_min: 'Folga da faixa',
  entrega_max_min: 'Teto do fim da faixa',
  raio_max_km: 'Raio máximo',
  entrega_atraso_tolerancia_min: 'Tolerância do atraso',
  entrega_cancel_resposta_min: 'Prazo para responder o cancelamento',
  entrega_compensacao_tipo: 'Compensação',
  entrega_compensacao_cents: 'Valor do cupom (R$)',
  entrega_lote_max: 'Corridas por lote',
  logistica_horario: 'Horário das entregas',
  logistica_dias: 'Dias de entrega',
};
const COMPENSATION_LABEL: Record<string, string> = { frete_gratis_proximo: 'Entrega grátis no próximo pedido', cupom_valor: 'Cupom em reais', nenhuma: 'Nenhuma' };
const DAYS_LABEL: Record<string, string> = { seg_sab: 'Segunda a sábado', seg_sex: 'Segunda a sexta', seg_dom: 'Todos os dias' };
const SUFFIX: Record<string, string> = { entrega_rota_fator_pct: '%', entrega_min_por_km: 'min/km', raio_max_km: 'km', entrega_compensacao_cents: 'R$' };

const nameOf = (key: string) => SHORT[key] ?? key;
const unitText = (key: string): string => {
  if (SUFFIX[key]) return SUFFIX[key]!;
  const unit = unitOf(key);
  return unit.kind === 'text' ? unit.text : '';
};
const num = (value: number) => String(value).replace('.', ',');

/** Valor numérico de um campo do formulário (reais já em centavos), ou `null` se ainda inválido. */
function numeric(params: Map<string, Parameter>, values: Record<string, string>, key: string): number | null {
  const param = params.get(key);
  if (!param) return null;
  const parsed = parseInput(param, values[key] ?? '');
  return 'value' in parsed && typeof parsed.value === 'number' ? parsed.value : null;
}

export function etaFromForm(params: Map<string, Parameter>, values: Record<string, string>): EtaParams | null {
  const get = (key: string) => numeric(params, values, key);
  const prepMin = get('entrega_preparo_padrao_min');
  const dispatchMin = get('entrega_despacho_min');
  const routeFactorPct = get('entrega_rota_fator_pct');
  const minPerKm = get('entrega_min_por_km');
  const bandMin = get('entrega_faixa_min');
  const maxMin = get('entrega_max_min');
  if ([prepMin, dispatchMin, routeFactorPct, minPerKm, bandMin, maxMin].some((value) => value === null)) return null;
  return { prepMin: prepMin!, dispatchMin: dispatchMin!, routeFactorPct: routeFactorPct!, minPerKm: minPerKm!, bandMin: bandMin!, maxMin: maxMin! };
}

/** Validação cruzada da conta (WB-258): a primeira falha vira o aviso do topo. O servidor repete a regra (422, mesmo texto). */
export function crossErrors(eta: EtaParams | null): string[] {
  if (!eta) return [];
  const out: string[] = [];
  if (eta.maxMin - eta.bandMin < eta.prepMin + eta.dispatchMin + 5) out.push('O teto menos a folga precisa ser pelo menos preparo + despacho + 5 min.');
  if (eta.bandMin > eta.maxMin / 4) out.push(`A folga pode ser no máximo um quarto do teto (${num(Math.floor(eta.maxMin / 4))} min).`);
  return out;
}

export function DeliveryParametersPage() {
  const { canView } = useSession();
  const query = useQuery({ queryKey: keys.parameters, queryFn: adminApi.parameters });
  if (!canView('parametros_entrega')) return <NoAccessState />;
  return (
    <>
      <PageHeader title="Parâmetros de entrega" eyebrow="Sistema" description="Valores de partida. Calibre com os dados do piloto. Mudanças valem para pedidos novos em até 60 s; pedidos já feitos mantêm o horário prometido." />
      <QueryBoundary query={query} skeletonLabel="Carregando os parâmetros de entrega">
        {(page) => <Form params={page.data} key={page.data.map((p) => `${p.key}:${String(p.value)}`).join('|')} />}
      </QueryBoundary>
    </>
  );
}

function Form({ params: list }: { params: Parameter[] }) {
  const client = useQueryClient();
  const toast = useToast();
  const params = useMemo(() => new Map(list.filter((p) => ALL_KEYS.includes(p.key)).map((p) => [p.key, p])), [list]);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries([...params.values()].map((p) => [p.key, toInput(p)])));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reasonErr, setReasonErr] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [distance, setDistance] = useState('5');
  const [prep, setPrep] = useState('');

  const eta = etaFromForm(params, values);
  const cross = crossErrors(eta);
  const changed = [...params.values()].filter((p) => (values[p.key] ?? '') !== toInput(p));
  const compensationType = values.entrega_compensacao_tipo;

  const save = useMutation({
    mutationFn: async (items: { key: string; value: string | number }[]) => {
      for (const item of items) await adminApi.updateParameter(item.key, item.value, reason.trim());
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.parameters });
      toast.show('Parâmetros de entrega salvos. Registrado na auditoria.');
      setReason('');
    },
    onError: (error) => {
      if (error instanceof ApiError && (error.status === 422 || error.code === 'PARAMETER_OUT_OF_RANGE')) setFormError(error.detail ?? 'A conta não fecha: confira os valores.');
      else setFormError(error instanceof ApiError && error.status >= 500 ? 'Não foi possível salvar. Os valores anteriores continuam valendo.' : saveErrorMessage(error));
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const found: Record<string, string> = {};
    const toSend: { key: string; value: string | number }[] = [];
    for (const param of changed) {
      const parsed = parseInput(param, values[param.key] ?? '');
      if ('error' in parsed) found[param.key] = parsed.error;
      else toSend.push({ key: param.key, value: parsed.value });
    }
    const why = reasonError(reason);
    setErrors(found);
    setReasonErr(why);
    if (Object.keys(found).length > 0 || why || cross.length > 0 || toSend.length === 0) return;
    save.mutate(toSend);
  }

  const reach = eta ? maxReachKm(eta, undefined) : null;
  const radius = numeric(params, values, 'raio_max_km');
  const km = Number(distance.replace(',', '.'));
  const kmOk = distance.trim() !== '' && Number.isFinite(km) && km >= 0;
  const prepOverride = prep.trim() === '' ? undefined : Number(prep.replace(',', '.'));
  const result = eta && kmOk ? estimateEta(eta, km, prepOverride !== undefined && Number.isFinite(prepOverride) ? prepOverride : undefined) : null;

  function field(key: string) {
    const param = params.get(key);
    if (!param) return null;
    if (key === 'entrega_compensacao_cents' && compensationType !== 'cupom_valor') return null;
    const range = rangeText(param);
    const hint = `Padrão ${toInput({ ...param, value: param.default })}${unitText(key) ? ` ${unitText(key)}` : ''}${range ? ` · ${range}` : ''}`;
    if (param.type === 'enum') {
      return (
        <SelectField key={key} label={nameOf(key)} value={values[key] ?? ''} onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))} data-testid={T(`field-${key}`)}>
          {param.values?.map((value) => (
            <option key={value} value={value}>{key === 'entrega_compensacao_tipo' ? (COMPENSATION_LABEL[value] ?? value) : key === 'logistica_dias' ? (DAYS_LABEL[value] ?? value) : value}</option>
          ))}
        </SelectField>
      );
    }
    return (
      <div key={key} className={s.fieldRow}>
        <TextField label={nameOf(key)} value={values[key] ?? ''} onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))} inputMode={param.type === 'window' ? 'text' : 'decimal'} error={errors[key]} hint={hint} autoComplete="off" data-testid={T(`field-${key}`)} />
        {unitText(key) ? <span className={cx('wb-text-body-strong', s.suffix)} aria-hidden="true">{unitText(key)}</span> : null}
      </div>
    );
  }

  return (
    <div className={s.layout}>
      <form onSubmit={submit} className={s.main} noValidate data-testid={T('form')}>
        {cross.length > 0 ? (
          <Banner tone="danger" testId={T('cross-error')}>
            {cross[0]}
          </Banner>
        ) : null}
        {GROUPS.filter((group) => group.keys.some((key) => params.has(key))).map((group) => (
          <section key={group.id} className={s.group} aria-labelledby={`pg-${group.id}`} data-testid={T(`group-${group.id}`)}>
            <h2 id={`pg-${group.id}`} className={cx('wb-text-title2', s.groupTitle)}>{group.title}</h2>
            <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>{group.hint}</p>
            <div className={s.fields}>{group.keys.map((key) => field(key))}</div>
          </section>
        ))}
        <section className={s.group} aria-labelledby="pg-motivo">
          <h2 id="pg-motivo" className={cx('wb-text-title2', s.groupTitle)}>Motivo da alteração</h2>
          <TextArea label="Motivo" value={reason} onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))} counter={{ value: reason.length, max: REASON_MAX }} error={reasonErr} hint="Fica no histórico e na auditoria de cada parâmetro alterado." rows={3} data-testid={T('reason')} />
          {formError ? <Banner tone="danger" testId={T('save-error')}>{formError}</Banner> : null}
          <Button type="submit" size="lg" loading={save.isPending} loadingLabel="Salvando…" disabled={changed.length === 0 || cross.length > 0} data-testid={T('save')}>
            {changed.length > 0 ? `Salvar ${changed.length} ${changed.length === 1 ? 'alteração' : 'alterações'}` : 'Nada para salvar'}
          </Button>
        </section>
      </form>

      <aside className={s.side} aria-label="Efeito dos valores">
        <section className={s.reach} aria-labelledby="pg-alcance" data-testid={T('reach')}>
          <h2 id="pg-alcance" className={cx('wb-text-label', s.reachLabel)}>Alcance</h2>
          <p className={s.reachValue}>{reach !== null ? <Lima>{num(reach)} km</Lima> : '—'}</p>
          <p className={cx('wb-text-caption', s.reachText)}>Com o preparo padrão de {eta ? eta.prepMin : '—'} min. Lojas com preparo maior alcançam menos.</p>
          {reach !== null && radius !== null && radius > reach ? (
            <p className={cx('wb-text-caption-strong', s.reachWarn)} data-testid={T('radius-warning')}>
              Raio máximo de {num(radius)} km: faixas de taxa acima de {num(reach)} km não serão usadas.
            </p>
          ) : null}
        </section>

        <section className={s.preview} aria-labelledby="pg-previa" data-testid={T('preview')}>
          <h2 id="pg-previa" className="wb-text-title2" style={{ margin: 0 }}>Prévia de horário</h2>
          <div className={s.previewInputs}>
            <TextField label="Distância (km)" inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} error={kmOk ? undefined : 'Digite a distância em km.'} data-testid={T('preview-km')} />
            <TextField label="Preparo da loja (min)" inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value)} hint={eta ? `Vazio usa ${eta.prepMin} min` : undefined} data-testid={T('preview-prep')} />
          </div>
          {eta && result ? <Equation eta={eta} result={result} /> : <p className="wb-text-caption" style={{ margin: 0 }}>Corrija os valores para ver a prévia.</p>}
        </section>
      </aside>
    </div>
  );
}

function Equation({ eta, result }: { eta: EtaParams; result: ReturnType<typeof estimateEta> }) {
  const total = Math.max(1, result.prepMin + result.dispatchMin + result.travelMin);
  const pct = (value: number) => `${Math.max(2, (value / total) * 100)}%`;
  const scaleMax = Math.max(eta.maxMin + 30, result.toMin + 10);
  const at = (minutes: number) => `${Math.min(100, (minutes / scaleMax) * 100)}%`;
  return (
    <div className={s.equation} role="status" aria-live="polite" data-testid={T('preview-result')}>
      <div className={s.bars} aria-hidden="true">
        <span className={s.barPrep} style={{ width: pct(result.prepMin) }} />
        <span className={s.barDispatch} style={{ width: pct(result.dispatchMin) }} />
        <span className={s.barTravel} style={{ width: pct(result.travelMin) }} />
      </div>
      <p className={cx('wb-text-caption', s.legend)}>
        <span><i className={s.dotPrep} aria-hidden="true" />Preparo {result.prepMin} min</span>
        <span><i className={s.dotDispatch} aria-hidden="true" />Espera do motoboy {result.dispatchMin} min</span>
        <span><i className={s.dotTravel} aria-hidden="true" />Trajeto {result.travelMin} min</span>
      </p>
      <div className={s.ruler} aria-hidden="true">
        <span className={s.band} style={{ left: at(result.fromMin), width: `${Math.max(1, ((result.toMin - result.fromMin) / scaleMax) * 100)}%` }} />
        <span className={s.ceiling} style={{ left: at(eta.maxMin) }} />
        <span className={cx('wb-text-micro', s.ceilingLabel)} style={{ left: at(eta.maxMin) }}>teto {eta.maxMin}</span>
      </div>
      {result.withinCeiling ? (
        <div className={s.verdict}>
          <p className={s.verdictValue}>Estimativa {result.estimateMin} min</p>
          <p className="wb-text-body-strong" style={{ margin: 0 }} data-testid={T('preview-band')}>O cliente vê: {result.fromMin} a {result.toMin} min</p>
          <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>Entra no alcance. Igual ao checkout para este par.</p>
        </div>
      ) : (
        <div className={cx(s.verdict, s.verdictOut)} data-testid={T('preview-outside')}>
          <p className={s.verdictValue}>Fora do alcance</p>
          <p className="wb-text-body" style={{ margin: 0 }}>O fim da faixa ({result.toMin} min) passa do teto de {eta.maxMin} min.</p>
        </div>
      )}
    </div>
  );
}
