/**
 * Logo v4a "Sacola Trapézio" (DEC-044). Sempre o arquivo oficial de `docs/design/logo/` (copiado para `public/brand/`):
 * nunca redigitar a palavra em fonte. `tone="white"` é para fundo roxo; `compact` mostra só o símbolo (cabeçalho do celular).
 * `size` é a altura em px. Tamanho mínimo da logo completa: 80 px de largura (altura 22).
 */
const RATIO = 458 / 126;
const SYMBOL_RATIO = 160 / 104;

export function Logo({ size = 32, tone = 'color', compact = false }: { size?: number; tone?: 'color' | 'white'; compact?: boolean }) {
  const src = compact ? (tone === 'white' ? '/brand/webag-simbolo-branco.svg' : '/brand/webag-simbolo.svg') : tone === 'white' ? '/brand/webag-logo-branca.svg' : '/brand/webag-logo.svg';
  const width = Math.round(size * (compact ? SYMBOL_RATIO : RATIO));
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG estático da marca, sem otimização necessária
    <img src={src} width={width} height={size} alt="Webag" style={{ display: 'block', flex: 'none' }} data-testid="logo" />
  );
}

/** Linhas de velocidade (motivo da marca): horizontais, apontam para a direita, 3 a 5 pílulas irregulares. Decorativo. */
export function SpeedLines({ className, tone = 'onBrand' }: { className?: string; tone?: 'onBrand' | 'onLight' }) {
  const fill = tone === 'onBrand' ? 'rgba(255,255,255,0.24)' : 'var(--wb-color-brand-200)';
  return (
    <svg className={className} viewBox="0 0 120 56" aria-hidden="true" focusable="false" data-speed-lines>
      <rect className="wb-line" x="30" y="0" width="58" height="8" rx="4" fill={fill} />
      <rect className="wb-line" x="0" y="16" width="104" height="8" rx="4" fill={fill} />
      <rect className="wb-line" x="14" y="32" width="64" height="8" rx="4" fill={fill} />
      <rect className="wb-line" x="46" y="48" width="36" height="8" rx="4" fill={fill} />
    </svg>
  );
}
