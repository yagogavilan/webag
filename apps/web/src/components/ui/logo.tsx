/** Símbolo + "webag" (identidade.md §2). Cores dos tokens; o símbolo segue docs/design/assets/webag-simbolo.svg. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--wb-space-2)', color: 'var(--wb-color-text-brand)' }}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path d="M22 24V19a10 10 0 0 1 20 0v5" fill="none" stroke="var(--wb-color-brand-600)" strokeWidth="5" strokeLinecap="round" />
        <rect x="8" y="22" width="48" height="34" rx="8" fill="var(--wb-color-brand-600)" />
        <path d="M19 33l6.5 14 6.5-10 6.5 10 6.5-14" fill="none" stroke="var(--wb-color-neutral-0)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ fontWeight: 'var(--wb-font-weight-bold)', fontSize: size * 0.75, lineHeight: 1 }}>webag</span>
    </span>
  );
}
