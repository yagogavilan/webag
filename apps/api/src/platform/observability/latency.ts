import type { NextFunction, Request, Response } from 'express';

/**
 * Latência por rota (p50/p95/p99), sem dado pessoal: a chave é o MÉTODO + o MODELO da rota (`/v1/browse/stores/:storeId`), nunca a URL crua (que
 * traz ids e coordenadas); rota que não casou vira `(sem rota)` e o Socket.IO, `(socket.io)`. Fica em memória e sai em UM log por janela
 * (`event: "http.latency"`), que o painel de logs consegue filtrar; é a medição mínima do p95 sem montar Prometheus (ADR de métricas segue em aberto).
 */
export interface RouteLatency {
  route: string;
  n: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  errors5xx: number;
}

interface Bucket {
  durations: number[];
  n: number;
  errors5xx: number;
  max: number;
}

const MAX_ROUTES = 300;
const MAX_SAMPLES = 5_000;

export const percentile = (sortedAscending: readonly number[], p: number): number =>
  sortedAscending.length === 0 ? 0 : sortedAscending[Math.min(sortedAscending.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAscending.length) - 1))]!; // nearest-rank

export function routeKey(req: Pick<Request, 'method' | 'baseUrl' | 'route' | 'path'>): string {
  const template = (req.route as { path?: unknown } | undefined)?.path;
  if (typeof template === 'string') return `${req.method} ${req.baseUrl ?? ''}${template}`;
  return req.path?.startsWith('/socket.io') ? '(socket.io)' : '(sem rota)';
}

export class LatencyRecorder {
  private buckets = new Map<string, Bucket>();

  record(route: string, ms: number, status: number): void {
    let bucket = this.buckets.get(route);
    if (!bucket) {
      if (this.buckets.size >= MAX_ROUTES) return; // teto de cardinalidade
      bucket = { durations: [], n: 0, errors5xx: 0, max: 0 };
      this.buckets.set(route, bucket);
    }
    bucket.n += 1;
    if (status >= 500) bucket.errors5xx += 1;
    if (ms > bucket.max) bucket.max = ms;
    if (bucket.durations.length < MAX_SAMPLES) bucket.durations.push(ms);
    else {
      // Amostragem por reservatório depois do teto: cada requisição da janela tem a mesma chance de entrar na amostra.
      const slot = Math.floor(Math.random() * bucket.n);
      if (slot < MAX_SAMPLES) bucket.durations[slot] = ms;
    }
  }

  /** Estatísticas da janela, da rota mais lenta (p95) para a mais rápida; zera os contadores. */
  snapshot(): RouteLatency[] {
    const out: RouteLatency[] = [];
    for (const [route, bucket] of this.buckets) {
      const sorted = bucket.durations.slice().sort((a, b) => a - b);
      out.push({ route, n: bucket.n, p50: round(percentile(sorted, 50)), p95: round(percentile(sorted, 95)), p99: round(percentile(sorted, 99)), max: round(bucket.max), errors5xx: bucket.errors5xx });
    }
    this.buckets = new Map();
    return out.sort((a, b) => b.p95 - a.p95);
  }

  middleware = (req: Request, res: Response, next: NextFunction): void => {
    const started = process.hrtime.bigint();
    res.on('finish', () => this.record(routeKey(req), Number(process.hrtime.bigint() - started) / 1e6, res.statusCode));
    next();
  };
}

const round = (value: number): number => Math.round(value * 10) / 10;
