'use client';

import { useState } from 'react';
import { SelectField, TextArea } from '@/components/ui';
import { ADMIN_SESSION_REASON_KEY, REASON_NOTE_WARNING } from '@/lib/stored-reasons';
import type { AdminReasonCode } from '@webag/shared';

/**
 * Motivo das edições do admin (WB-351 C2/C7; catálogo `AdminReason`). Edição geral aceita 5 códigos; PREÇO só 4 (lista própria, WB-353).
 * "Solicitado pelo lojista" exige canal e data; "Outro" exige o texto. O motivo da sessão vem preenchido (spec §0 decisão 2), mas cada
 * alteração o confirma no diálogo e grava o próprio motivo no `audit_log`.
 */
export const GENERAL_REASONS = ['requested_by_merchant', 'error_fix', 'moderation', 'operational_decision', 'other'] as const satisfies readonly AdminReasonCode[];
export type GeneralReason = (typeof GENERAL_REASONS)[number];

export const REASON_LABEL: Record<AdminReasonCode, string> = {
  requested_by_merchant: 'Solicitado pelo lojista',
  error_fix: 'Correção de erro',
  moderation: 'Moderação',
  operational_decision: 'Decisão operacional',
  other: 'Outro',
  obvious_price_error: 'Erro evidente',
  legal_or_inspection_order: 'Ordem de fiscalização ou do jurídico',
  agreed_campaign: 'Campanha acordada',
};

export const NOTE_MAX = 200;
export interface ReasonValue {
  code: AdminReasonCode | '';
  note: string;
}
export const EMPTY_REASON: ReasonValue = { code: '', note: '' };

const SESSION_KEY = ADMIN_SESSION_REASON_KEY;

/** Motivo desta sessão do navegador (só código e nota do próprio admin; nada de dado de cliente). */
export function readSessionReason(): ReasonValue {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ReasonValue>) : null;
    if (parsed && typeof parsed.code === 'string' && (GENERAL_REASONS as readonly string[]).includes(parsed.code)) return { code: parsed.code as AdminReasonCode, note: typeof parsed.note === 'string' ? parsed.note.slice(0, NOTE_MAX) : '' };
  } catch {
    /* sem armazenamento: o motivo só não vem preenchido */
  }
  return EMPTY_REASON;
}
export function saveSessionReason(value: ReasonValue): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
  } catch {
    /* idem */
  }
}

/** Mensagens da spec §3.5. `null` = válido. */
export function validateReason(value: ReasonValue): { field: 'code' | 'note'; message: string } | null {
  if (!value.code) return { field: 'code', message: 'Informe o motivo.' };
  const note = value.note.trim();
  if (value.code === 'requested_by_merchant' && note.length === 0) return { field: 'note', message: 'Informe o canal e a data.' };
  if (value.code === 'other' && note.length === 0) return { field: 'note', message: 'Explique o motivo.' };
  return null;
}

export function reasonPayload(value: ReasonValue): { code: AdminReasonCode; note?: string } {
  const note = value.note.trim();
  return { code: value.code as AdminReasonCode, ...(note ? { note } : {}) };
}

export function useReasonState(): [ReasonValue, (next: ReasonValue) => void] {
  const [value, setValue] = useState<ReasonValue>(readSessionReason);
  return [value, setValue];
}

interface Props {
  value: ReasonValue;
  onChange: (next: ReasonValue) => void;
  options?: readonly AdminReasonCode[];
  /** Erros por campo (cliente ou servidor). */
  errors?: { code?: string | undefined; note?: string | undefined };
  testId?: string;
}

export function AdminReasonFields({ value, onChange, options = GENERAL_REASONS, errors, testId = 'admin.motivo' }: Props) {
  const needsNote = value.code === 'requested_by_merchant' || value.code === 'other';
  return (
    <>
      <SelectField label="Motivo" value={value.code} onChange={(event) => onChange({ ...value, code: event.target.value as AdminReasonCode | '' })} error={errors?.code} data-testid={`${testId}.code`}>
        <option value="">Escolha o motivo</option>
        {options.map((code) => (
          <option key={code} value={code}>
            {REASON_LABEL[code]}
          </option>
        ))}
      </SelectField>
      {needsNote ? (
        <TextArea
          label={value.code === 'requested_by_merchant' ? 'Canal e data (ex.: WhatsApp, 24/11)' : 'Descreva o motivo'}
          value={value.note}
          onChange={(event) => onChange({ ...value, note: event.target.value.slice(0, NOTE_MAX) })}
          counter={{ value: value.note.length, max: NOTE_MAX }}
          error={errors?.note}
          hint={REASON_NOTE_WARNING}
          rows={2}
          data-testid={`${testId}.note`}
        />
      ) : null}
    </>
  );
}
