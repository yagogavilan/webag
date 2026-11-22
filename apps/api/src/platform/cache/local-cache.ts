/**
 * Cache em memória do processo com TTL e "single-flight": se 200 requisições pedem o mesmo valor vencido ao mesmo tempo, UMA calcula e as outras
 * esperam a mesma promessa (sem isso, a virada do TTL vira uma debandada contra o banco). Erro nunca é guardado. TTL <= 0 desliga o cache
 * (a consulta roda direto), que é como os testes e2e usam. Para dado que pode ficar defasado por alguns segundos e é igual para todos os usuários.
 */
export class LocalTtlCache<T> {
  private readonly entries = new Map<string, { at: number; value?: T; pending?: Promise<T> }>();

  constructor(private readonly maxEntries = 200) {}

  async get(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
    if (ttlMs <= 0) return compute();
    const now = Date.now();
    const hit = this.entries.get(key);
    if (hit?.pending) return hit.pending;
    if (hit && 'value' in hit && now - hit.at < ttlMs) return hit.value as T;
    const pending = compute().then(
      (value) => {
        this.entries.set(key, { at: Date.now(), value });
        return value;
      },
      (error: unknown) => {
        // Mantém o valor antigo (se havia) para quem chegar depois: melhor dado de segundos atrás do que erro em cascata.
        if (hit && 'value' in hit) this.entries.set(key, { at: hit.at, value: hit.value });
        else this.entries.delete(key);
        throw error;
      },
    );
    this.entries.set(key, { at: hit?.at ?? now, ...(hit && 'value' in hit ? { value: hit.value } : {}), pending });
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined && oldest !== key) this.entries.delete(oldest);
    }
    return pending;
  }

  clear(): void {
    this.entries.clear();
  }
}
