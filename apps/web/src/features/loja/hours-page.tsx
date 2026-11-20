'use client';

import { Trash } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Banner, Button, CheckboxField, Dialog, Switch, TextField, ui, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { saveErrorMessage } from '@/lib/api/messages';
import { settingsApi, type DayHours, type StoreSettings } from '@/lib/api/store-settings';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { PauseCard } from './pause-card';
import { SettingsFrame } from './settings-frame';
import { SettingsScreen } from './settings-screen';
import s from './loja.module.css';

const T = (id: string) => ltid('horarios', id);

/** Segunda a domingo (a API usa 0 = domingo). */
export const WEEK = [
  { weekday: 1, label: 'Segunda' },
  { weekday: 2, label: 'Terça' },
  { weekday: 3, label: 'Quarta' },
  { weekday: 4, label: 'Quinta' },
  { weekday: 5, label: 'Sexta' },
  { weekday: 6, label: 'Sábado' },
  { weekday: 0, label: 'Domingo' },
] as const;

interface Interval {
  start: string;
  end: string;
}
type Week = Record<number, { open: boolean; intervals: Interval[] }>;
const DEFAULT_INTERVAL: Interval = { start: '09:00', end: '18:00' };

export function maskTime(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

function toWeek(hours: DayHours[]): Week {
  return Object.fromEntries(WEEK.map(({ weekday }) => {
    const intervals = hours.find((day) => day.weekday === weekday)?.intervals ?? [];
    return [weekday, { open: intervals.length > 0, intervals: intervals.length > 0 ? intervals : [{ ...DEFAULT_INTERVAL }] }];
  }));
}

/** Mensagem do primeiro problema do dia, ou `null`. */
export function validateDay(intervals: Interval[]): string | null {
  for (const interval of intervals) if (!TIME.test(interval.start) || !TIME.test(interval.end)) return 'Confira o horário (ex.: 09:00).';
  for (const interval of intervals) if (minutes(interval.end) <= minutes(interval.start)) return 'O horário de fechar precisa ser depois do de abrir.';
  if (intervals.length === 2) {
    const [a, b] = [...intervals].sort((x, y) => minutes(x.start) - minutes(y.start));
    if (a && b && minutes(a.end) > minutes(b.start)) return 'Os dois horários não podem se sobrepor.';
  }
  return null;
}

export function HoursPage() {
  return <SettingsScreen>{({ store, settings, refresh }) => <HoursForm storeId={store.id} settings={settings} refresh={refresh} />}</SettingsScreen>;
}

/** C3: pausa, horário da semana e feriados. Pausar e reabrir agem na hora; horários e feriados vão no "Salvar horários". */
export function HoursForm({ storeId, settings, refresh }: { storeId: string; settings: StoreSettings; refresh: () => Promise<unknown> }) {
  const router = useRouter();
  const toast = useToast();
  const initial = useMemo(() => toWeek(settings.hours), [settings.hours]);
  const [week, setWeek] = useState<Week>(initial);
  const [holidays, setHolidays] = useState(settings.holidays.map((h) => ({ date: h.date, label: h.label ?? '' })));
  const [newDate, setNewDate] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const [copyTo, setCopyTo] = useState<number[]>([]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [holidayError, setHolidayError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const noHours = settings.hours.every((day) => day.intervals.length === 0);
  const dirty = JSON.stringify(week) !== JSON.stringify(initial) || JSON.stringify(holidays) !== JSON.stringify(settings.holidays.map((h) => ({ date: h.date, label: h.label ?? '' })));

  const setDay = (weekday: number, patch: Partial<Week[number]>) => setWeek((current) => ({ ...current, [weekday]: { ...current[weekday]!, ...patch } }));
  const setInterval = (weekday: number, index: number, patch: Partial<Interval>) =>
    setWeek((current) => ({ ...current, [weekday]: { ...current[weekday]!, intervals: current[weekday]!.intervals.map((item, i) => (i === index ? { ...item, ...patch } : item)) } }));
  const preset = (weekdays: number[]) => setWeek(Object.fromEntries(WEEK.map(({ weekday }) => [weekday, { open: weekdays.includes(weekday), intervals: [{ ...DEFAULT_INTERVAL }] }])));

  function addHoliday() {
    setHolidayError(null);
    if (!newDate) return setHolidayError('Escolha a data.');
    if (holidays.some((h) => h.date === newDate)) return setHolidayError('Essa data já está na lista.');
    setHolidays((current) => [...current, { date: newDate, label: newLabel.trim() }].sort((a, b) => a.date.localeCompare(b.date)));
    setNewDate('');
    setNewLabel('');
  }

  async function submit() {
    const found: Record<number, string> = {};
    for (const { weekday } of WEEK) {
      const day = week[weekday]!;
      const problem = day.open ? validateDay(day.intervals) : null;
      if (problem) found[weekday] = problem;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setFormError(null);
    try {
      await settingsApi.setHours(storeId, WEEK.map(({ weekday }) => ({ weekday, intervals: week[weekday]!.open ? week[weekday]!.intervals : [] })));
      await settingsApi.setHolidays(storeId, holidays.map((h) => ({ date: h.date, ...(h.label ? { label: h.label } : {}) })));
      await refresh();
      toast.show('Horários salvos.');
      router.push(asRoute('/lojista/loja'));
    } catch (caught) {
      setBusy(false);
      setFormError(caught instanceof ApiError && caught.fields.length > 0 ? caught.fields[0]!.message : saveErrorMessage(caught));
    }
  }

  return (
    <div className={ui.stack}>
      <SettingsFrame screen="horarios" title="Horários e pausa" dirty={dirty} busy={busy} submitLabel="Salvar horários" onSubmit={() => void submit()} error={formError}>
        <PauseCard storeId={storeId} settings={settings} refresh={refresh} screen="horarios" />
        {noHours ? (
          <Banner tone="warning" testId={T('empty')}>
            Sua loja está sem horário e aparece como fechada.
          </Banner>
        ) : null}
        <div className={s.chips}>
          <Button variant={noHours ? 'primary' : 'secondary'} size="sm" onClick={() => preset([1, 2, 3, 4, 5])} data-testid={T('preset-weekdays')}>Seg a sex, 9h às 18h</Button>
          <Button variant={noHours ? 'primary' : 'secondary'} size="sm" onClick={() => preset([0, 1, 2, 3, 4, 5, 6])} data-testid={T('preset-all')}>Todos os dias, 9h às 18h</Button>
        </div>
        {WEEK.map(({ weekday, label }) => {
          const day = week[weekday]!;
          const summary = day.open ? day.intervals.map((i) => `${i.start} às ${i.end}`).join(' e ') : 'fechado';
          return (
            <fieldset key={weekday} className={s.dayRow} aria-label={`${label}: ${day.open ? 'aberto' : 'fechado'}, ${summary}`}>
              <legend className="wb-text-body-strong">{label}</legend>
              <Switch checked={day.open} onChange={(open) => setDay(weekday, { open })} label={label} onText="Aberto" offText="Fechado" testId={T(`day-${weekday}-switch`)} />
              {day.open ? (
                <>
                  {day.intervals.map((interval, index) => (
                    <div key={index} className={s.intervals}>
                      <TextField className={s.timeField} label={index === 0 ? 'Abre' : 'Abre de novo'} inputMode="numeric" placeholder="00:00" value={interval.start} onChange={(e) => setInterval(weekday, index, { start: maskTime(e.target.value) })} data-testid={T(`day-${weekday}-open-${index + 1}`)} />
                      <TextField className={s.timeField} label="Fecha" inputMode="numeric" placeholder="00:00" value={interval.end} onChange={(e) => setInterval(weekday, index, { end: maskTime(e.target.value) })} data-testid={T(`day-${weekday}-close-${index + 1}`)} />
                      {index === 1 ? (
                        <Button variant="text" size="sm" icon={<Trash size={20} aria-hidden="true" />} onClick={() => setDay(weekday, { intervals: day.intervals.slice(0, 1) })} aria-label={`Remover o 2º horário de ${label}`}>Remover</Button>
                      ) : null}
                    </div>
                  ))}
                  <div className={ui.row}>
                    {day.intervals.length < 2 ? (
                      <Button variant="text" size="sm" onClick={() => setDay(weekday, { intervals: [...day.intervals, { start: '14:00', end: '18:00' }] })} data-testid={T(`day-${weekday}-add-interval`)}>Adicionar 2º horário</Button>
                    ) : null}
                    <Button variant="text" size="sm" onClick={() => { setCopyFrom(weekday); setCopyTo([]); }} data-testid={T(`day-${weekday}-copy`)}>Copiar para outros dias</Button>
                  </div>
                </>
              ) : null}
              {errors[weekday] ? <p role="alert" className="wb-text-caption" style={{ margin: 0, color: 'var(--wb-color-text-danger)' }}>{errors[weekday]}</p> : null}
            </fieldset>
          );
        })}

        <section className={ui.stack} aria-labelledby="feriados">
          <h2 id="feriados" className="wb-text-title2" style={{ margin: 0 }}>Feriados e folgas</h2>
          <p className="wb-text-caption" style={{ margin: 0 }}>Nessas datas a loja aparece como &quot;Fechada hoje&quot; no app.</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid={T('holidays')}>
            {holidays.map((holiday) => (
              <li key={holiday.date} className={ui.row} style={{ justifyContent: 'space-between' }}>
                <span className="wb-text-body">{new Date(`${holiday.date}T12:00:00`).toLocaleDateString('pt-BR')}{holiday.label ? ` · ${holiday.label}` : ''}</span>
                <Button variant="text" size="sm" icon={<Trash size={20} aria-hidden="true" />} onClick={() => setHolidays((current) => current.filter((h) => h.date !== holiday.date))} aria-label={`Remover ${holiday.date}`} data-testid={T(`holiday-${holiday.date}-remove`)}>Remover</Button>
              </li>
            ))}
          </ul>
          <div className={ui.row} style={{ alignItems: 'flex-end' }}>
            <TextField label="Data" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} error={holidayError ?? undefined} data-testid={T('holiday-date')} />
            <TextField label="Motivo (opcional)" value={newLabel} maxLength={60} onChange={(e) => setNewLabel(e.target.value)} data-testid={T('holiday-label')} />
            <Button variant="secondary" onClick={addHoliday} data-testid={T('holiday-add')}>Adicionar data</Button>
          </div>
        </section>
      </SettingsFrame>

      {copyFrom !== null ? (
        <Dialog
          title="Copiar para outros dias"
          onClose={() => setCopyFrom(null)}
          testId={T('copy-dialog')}
          actions={
            <>
              <Button
                disabled={copyTo.length === 0}
                onClick={() => {
                  const source = week[copyFrom]!;
                  setWeek((current) => ({ ...current, ...Object.fromEntries(copyTo.map((weekday) => [weekday, { open: source.open, intervals: source.intervals.map((i) => ({ ...i })) }])) }));
                  setCopyFrom(null);
                }}
                data-testid={T('copy-days')}
              >
                Copiar
              </Button>
              <Button variant="text" onClick={() => setCopyFrom(null)}>Cancelar</Button>
            </>
          }
        >
          {WEEK.filter((d) => d.weekday !== copyFrom).map(({ weekday, label }) => (
            <CheckboxField key={weekday} label={label} checked={copyTo.includes(weekday)} onChange={(e) => setCopyTo((current) => (e.target.checked ? [...current, weekday] : current.filter((w) => w !== weekday)))} />
          ))}
        </Dialog>
      ) : null}
    </div>
  );
}
