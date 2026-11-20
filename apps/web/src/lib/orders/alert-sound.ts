/**
 * Som do alerta de pedido novo (WB-067). O navegador só libera áudio depois de um toque do usuário, então o painel pede
 * "Ligar som" no começo do turno: `enable()` cria e retoma o `AudioContext` dentro desse toque. O som é sintetizado
 * (sem arquivo de áudio): 3 toques curtos no alerta normal e 5, mais agudos e mais altos, no alerta forte (a partir de 5 min).
 */
export type AlertLevel = 'normal' | 'strong';

export interface AlertSound {
  /** O navegador tem Web Audio. */
  readonly supported: boolean;
  /** `true` só com o contexto realmente em execução (aba suspensa pelo sistema volta a `false`). */
  isEnabled(): boolean;
  /** Deve ser chamado de dentro de um clique. Devolve se o som ficou ligado. */
  enable(): Promise<boolean>;
  play(level: AlertLevel): void;
  subscribe(listener: () => void): () => void;
}

interface Beep {
  frequency: number;
  gain: number;
  beeps: number;
}
const LEVELS: Record<AlertLevel, Beep> = {
  normal: { frequency: 880, gain: 0.3, beeps: 3 },
  strong: { frequency: 1175, gain: 0.9, beeps: 5 },
};
const BEEP_SECONDS = 0.16;
const GAP_SECONDS = 0.1;

type ContextCtor = new () => AudioContext;
function contextCtor(): ContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: ContextCtor; webkitAudioContext?: ContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function createAlertSound(): AlertSound {
  const Ctor = contextCtor();
  let ctx: AudioContext | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  function tone(frequency: number, gain: number, at: number, seconds: number) {
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const volume = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    // Envelope curto: sem estalo no começo e no fim do toque.
    volume.gain.setValueAtTime(0.0001, at);
    volume.gain.exponentialRampToValueAtTime(gain, at + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    oscillator.connect(volume);
    volume.connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(at + seconds + 0.02);
  }

  return {
    supported: Ctor !== null,
    isEnabled: () => ctx?.state === 'running',
    async enable() {
      if (!Ctor) return false;
      try {
        if (!ctx) {
          ctx = new Ctor();
          ctx.addEventListener('statechange', notify);
        }
        await ctx.resume();
        // Toque curto e baixo de confirmação (também destrava o áudio no iOS).
        tone(660, 0.15, ctx.currentTime, 0.12);
      } catch {
        return false;
      }
      notify();
      return ctx.state === 'running';
    },
    play(level) {
      if (!ctx || ctx.state !== 'running') return;
      const { frequency, gain, beeps } = LEVELS[level];
      const start = ctx.currentTime + 0.02;
      for (let i = 0; i < beeps; i += 1) tone(frequency, gain, start + i * (BEEP_SECONDS + GAP_SECONDS), BEEP_SECONDS);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
