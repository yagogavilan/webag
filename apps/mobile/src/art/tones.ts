// Tons de um objeto a partir da cor base (kit-marca-v3.md §7, regra `tones()` do protótipo): sombra e realce derivados.
const NIGHT = '#1C1721';

function channels(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function mix(hex: string, target: string, k: number): string {
  const a = channels(hex);
  const b = channels(target);
  const out = a.map((c, i) => Math.round(c * (1 - k) + (b[i] as number) * k));
  return `#${((1 << 24) | ((out[0] as number) << 16) | ((out[1] as number) << 8) | (out[2] as number)).toString(16).slice(1)}`;
}

export function luminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** [sombra, realce]: base escura -> sombra 45% preto e realce 16% branco; clara -> 11% noite e branco; média -> 24% noite e 30% branco. */
export function tones(base: string): { shade: string; light: string } {
  const lum = luminance(base);
  if (lum < 0.2) return { shade: mix(base, '#000000', 0.45), light: mix(base, '#FFFFFF', 0.16) };
  if (lum > 0.82) return { shade: mix(base, NIGHT, 0.11), light: '#FFFFFF' };
  return { shade: mix(base, NIGHT, 0.24), light: mix(base, '#FFFFFF', 0.3) };
}
