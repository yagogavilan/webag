/**
 * Relógio do SERVIDOR (I11). O vencimento do PIX e de qualquer prazo é decidido por quem criou o prazo: se o relógio do aparelho
 * está adiantado, a tela não pode mostrar "venceu" antes do servidor. Cada resposta HTTP traz o cabeçalho `Date`; o app guarda a
 * diferença (servidor menos aparelho) e `serverNow()` aplica essa diferença. Sem resposta ainda, usa o relógio do aparelho.
 */
let offsetMs = 0;
let synced = false;

/** `Date` tem resolução de 1 s: usa o ponto médio da ida e volta como referência do aparelho e arredonda para o meio do segundo. */
export function observeServerDate(dateHeader: string | null | undefined, sentAt: number, receivedAt: number): void {
  if (!dateHeader) return;
  const server = Date.parse(dateHeader);
  if (Number.isNaN(server)) return;
  const rtt = receivedAt - sentAt;
  // resposta demorada (rede ruim) é pouco confiável: só aceita se a ida e volta foi razoável ou se ainda não há referência
  if (synced && rtt > 5_000) return;
  offsetMs = server + 500 - (sentAt + rtt / 2);
  synced = true;
}

export const serverNow = (): number => Date.now() + offsetMs;

export const serverClockOffset = (): number => offsetMs;

/** Só para testes. */
export function resetServerClock(): void {
  offsetMs = 0;
  synced = false;
}
