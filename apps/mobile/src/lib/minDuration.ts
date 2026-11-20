/** Mantém o estado "Entrando…" por no mínimo `ms`, igual para sucesso e erro: a tela não "pensa" mais para um caso (onda-1b §0.2). */
export async function withMinDuration<T>(work: Promise<T>, ms = 600): Promise<T> {
  const floor = new Promise<void>((resolve) => setTimeout(resolve, ms));
  const [result] = await Promise.allSettled([work, floor]);
  if (result.status === 'rejected') throw result.reason;
  return result.value;
}
