import { AppError } from '../http/app-error.js';

/**
 * Cache em memória do processo com TTL e "single-flight": se 200 requisições pedem o mesmo valor vencido ao mesmo tempo, UMA calcula e as outras
 * esperam a mesma promessa (sem isso, a virada do TTL vira uma debandada contra o banco). Erro nunca é guardado (com valor antigo, ele serve por até 4x o TTL enquanto o recálculo falha; `invalidate` apaga também esse valor antigo, DEC-113). TTL <= 0 desliga o cache
 * (a consulta roda direto), que é como os testes e2e usam. Para dado que pode ficar defasado por alguns segundos e é igual para todos os usuários.
 */
export class LocalTtlCache<T> {
  /** `at`: de quando conta o TTL; `computedAt`: quando o valor foi de fato calculado (limita o quanto um valor antigo pode servir no erro). */
  private readonly entries = new Map<string, { at: number; computedAt?: number; value?: T; pending?: Promise<T> }>();

  /** Erro no recálculo: o valor antigo ainda serve por até este múltiplo do TTL, e o recálculo só é tentado de novo depois de `RETRY_AFTER_MS`. */
  static readonly STALE_FACTOR = 4;
  static readonly RETRY_AFTER_MS = 1_000;

  constructor(private readonly maxEntries = 200) {}

  async get(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
    if (ttlMs <= 0) return compute();
    const now = Date.now();
    const hit = this.entries.get(key);
    if (hit?.pending) return hit.pending;
    if (hit && 'value' in hit && now - hit.at < ttlMs) return hit.value as T;
    const pending: Promise<T> = compute().then(
      (value) => {
        // Invalidada (ou expulsa) enquanto calculava: o valor nasceu antes da mudança, então serve a quem já esperava, mas não fica guardado.
        if (this.entries.get(key)?.pending !== pending) return value;
        const at = Date.now();
        this.entries.set(key, { at, computedAt: at, value });
        return value;
      },
      (error: unknown) => {
        // Stale-if-error: com valor antigo (até STALE_FACTOR x TTL) ele continua servindo e o recálculo recua ~1 s, em vez de cada requisição
        // bater no banco que falhou e receber erro. Sem valor antigo (ou velho demais) o erro propaga e nada é guardado.
        // `AppError` (404 loja suspensa/produto removido, 409...) é RESPOSTA do negócio, não falha de infraestrutura: nunca é mascarada por valor antigo.
        // Invalidada no meio do recálculo (DEC-113): o valor antigo é justamente o que foi retirado, então o erro propaga.
        if (this.entries.get(key)?.pending !== pending) throw error;
        const computedAt = hit?.computedAt ?? hit?.at ?? 0;
        if (hit && 'value' in hit && !(error instanceof AppError) && Date.now() - computedAt < ttlMs * LocalTtlCache.STALE_FACTOR) {
          this.entries.set(key, { at: Date.now() - ttlMs + Math.min(LocalTtlCache.RETRY_AFTER_MS, ttlMs), computedAt, value: hit.value });
          return hit.value as T;
        }
        this.entries.delete(key);
        throw error;
      },
    );
    this.entries.set(key, { at: hit?.at ?? now, ...(hit && 'value' in hit ? { value: hit.value, computedAt: hit.computedAt ?? hit.at } : {}), pending });
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined && oldest !== key) this.entries.delete(oldest);
    }
    return pending;
  }

  clear(): void {
    this.entries.clear();
  }

  /**
   * DEC-113: APAGA as entradas (valor, valor antigo do stale-if-error e cálculo em andamento), em vez de esperar o TTL. Sem filtro apaga tudo; com filtro,
   * apaga as que ele aprova (`value` é `undefined` enquanto a entrada só tem o cálculo em andamento: filtro por valor deve tratar isso como "apagar").
   * Quem já esperava um cálculo em andamento recebe o resultado, mas ele não é guardado. Devolve quantas entradas apagou.
   */
  invalidate(match?: (key: string, value: T | undefined) => boolean): number {
    let removed = 0;
    for (const [key, entry] of [...this.entries]) {
      if (match && !match(key, 'value' in entry ? entry.value : undefined)) continue;
      this.entries.delete(key);
      removed += 1;
    }
    return removed;
  }
}
