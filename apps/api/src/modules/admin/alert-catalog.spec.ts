import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN_PROFILES } from '../identity/db/schema.js';
import { ALERT_AREAS, ALERT_KINDS, ALERT_SEVERITIES, alertKindInfo, alertKindsVisibleTo, canSeeAlertKind } from './alert-catalog.js';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') && name !== 'alert-catalog.ts' ? [readFileSync(path, 'utf8')] : [];
  });
}

/** Os tipos de alerta que o código grava. Leitura por padrão de texto: cobre as formas usadas hoje (`raiseAlert`, `raiseAlertIn`, `this.alert`, `alertOnce`, `alertTeam`, insert direto). */
function kindsInCode(): Set<string> {
  const code = sources(join(process.cwd(), 'src')).join('\n');
  const found = new Set<string>();
  const patterns = [
    /raiseAlert(?:In)?\(([^'\n]*?)'([a-z]+(?:_[a-z]+)+)'/g,
    /\.alert\(([^'\n]*?)'([a-z]+(?:_[a-z]+)+)'/g,
    /alertOnce\(()'([a-z]+(?:_[a-z]+)+)'/g,
    /alertTeam\(([^'\n]*?)'([a-z]+(?:_[a-z]+)+)'/g,
    /paymentAlerts\)\.values\(\{[^}\n]*?kind: ()'([a-z]+(?:_[a-z]+)+)'/g,
  ];
  for (const re of patterns) for (const m of code.matchAll(re)) found.add(m[2]!);
  // `raiseAlert(null, d.kind === 'exchange_pickup' ? 'collection_late' : 'delivery_late', ...)` e `exhausted ? 'refund_exhausted' : 'refund_failed'` casam o 1º literal.
  found.delete('exchange_pickup');
  for (const extra of ['delivery_late', 'refund_failed']) if (code.includes(`'${extra}'`)) found.add(extra);
  return found;
}

describe('catálogo de alertas do admin (B3)', () => {
  it('todo tipo gravado pelo código tem rótulo, gravidade, área e público definidos', () => {
    const found = kindsInCode();
    expect(found.size).toBeGreaterThan(25);
    expect([...found].filter((kind) => !(kind in ALERT_KINDS)).sort()).toEqual([]);
  });

  it('cada entrada é completa e usa só valores conhecidos; ninguém fica sem quem a veja', () => {
    for (const [kind, info] of Object.entries(ALERT_KINDS)) {
      expect(info.label.length, kind).toBeGreaterThan(5);
      expect(info.hint.length, kind).toBeGreaterThan(20);
      expect(ALERT_AREAS, kind).toContain(info.area);
      expect(ALERT_SEVERITIES, kind).toContain(info.severity);
      expect(info.audience.length, kind).toBeGreaterThan(0);
      expect(info.audience, kind).toContain('super_admin'); // o super admin vê tudo
    }
  });

  it('dinheiro é do financeiro e do super admin; operação e suporte não veem; LGPD só o super admin', () => {
    expect(canSeeAlertKind('finance', 'conciliation_mismatch')).toBe(true);
    expect(canSeeAlertKind('operations', 'conciliation_mismatch')).toBe(false);
    expect(canSeeAlertKind('support', 'refund_exhausted')).toBe(false);
    expect(canSeeAlertKind('operations', 'order_not_received')).toBe(true);
    expect(canSeeAlertKind('finance', 'order_not_received')).toBe(false);
    for (const profile of ADMIN_PROFILES.filter((p) => p !== 'super_admin')) expect(canSeeAlertKind(profile, 'account_deletion_overdue')).toBe(false);
  });

  it('tipo desconhecido aparece como "Outro alerta" só para o super admin; chave herdada do objeto não vira tipo', () => {
    expect(alertKindInfo('algo_novo')).toMatchObject({ label: 'Outro alerta', audience: ['super_admin'] });
    expect(alertKindInfo('toString').label).toBe('Outro alerta');
    expect(alertKindsVisibleTo('super_admin').all).toBe(true);
    expect(alertKindsVisibleTo('operations').all).toBe(false);
  });
});
