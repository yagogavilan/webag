/** Janela de marketing no horário de Brasília (UTC-3 fixo desde 2019). `window` = "HH:MM-HH:MM". */
const SP_OFFSET_MS = 3 * 3_600_000;

export function parseWindow(window: string): { startMin: number; endMin: number } {
  const match = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(window);
  if (!match) throw new Error(`janela inválida: ${window}`);
  return { startMin: Number(match[1]) * 60 + Number(match[2]), endMin: Number(match[3]) * 60 + Number(match[4]) };
}

const minuteOfDaySp = (at: Date): number => {
  const sp = new Date(at.getTime() - SP_OFFSET_MS);
  return sp.getUTCHours() * 60 + sp.getUTCMinutes();
};

export const isInWindow = (at: Date, window: string): boolean => {
  const { startMin, endMin } = parseWindow(window);
  const minute = minuteOfDaySp(at);
  return minute >= startMin && minute < endMin;
};

/** O próprio instante se já está dentro da janela; senão o próximo início (hoje, se ainda não abriu; amanhã, se já fechou). */
export function nextWindowStart(at: Date, window: string): Date {
  if (isInWindow(at, window)) return at;
  const { startMin } = parseWindow(window);
  const sp = new Date(at.getTime() - SP_OFFSET_MS);
  const dayStartSp = Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate());
  let start = dayStartSp + startMin * 60_000 + SP_OFFSET_MS;
  if (start <= at.getTime()) start += 86_400_000;
  return new Date(start);
}
