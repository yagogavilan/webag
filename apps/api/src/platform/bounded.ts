/**
 * Teto para coleções em memória que guardam um recado "dentro da transação" para o gancho pós-commit consumir (eventos do pedido,
 * concessão de compensação). Se a transação desfaz depois do `set`, o gancho nunca roda e a entrada ficaria para sempre; com o teto, a
 * mais antiga (ordem de inserção) sai quando passa de `max`. Em operação normal a coleção tem poucas entradas e o teto nunca age.
 */
export function capOldest(collection: Map<unknown, unknown> | Set<unknown>, max = 1_000): void {
  while (collection.size > max) {
    const oldest = collection.keys().next();
    if (oldest.done) return;
    collection.delete(oldest.value);
  }
}
