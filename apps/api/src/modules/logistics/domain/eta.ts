/**
 * ETA de entrega estilo iFood (DEC-053, RN-18): preparo da loja + espera de despacho + deslocamento, mostrado como FAIXA.
 * Deslocamento = distância em linha reta (PostGIS) x fator de rota x minutos por km. Função pura: a MESMA conta serve a
 * descoberta, a loja, o produto, a sacola, o checkout e o pedido (não diverge entre telas).
 */
export interface EtaConfig {
  /** Preparo padrão (min), usado quando a loja não define o seu. */
  defaultPrepMin: number;
  /** Espera de despacho (min). */
  dispatchMin: number;
  /** Fator de rota sobre a linha reta, em centésimos (130 = 1,30). */
  routeFactorPct: number;
  /** Minutos por km rodado (decimal). */
  minPerKm: number;
  /** Folga da faixa: +- min em torno da estimativa. */
  bandMin: number;
  /** Teto: acima disso a loja não entrega para o endereço. */
  maxMin: number;
}

export interface EtaEstimate {
  /** Estimativa central (min), arredondada para cima. */
  estimateMin: number;
  /** Limites da faixa (min a partir de agora). */
  fromMin: number;
  toMin: number;
  /** Partes da conta (para o painel e o recálculo). */
  prepMin: number;
  dispatchMin: number;
  travelMin: number;
  /** `false` quando a estimativa passa do teto: a loja não entrega para esse endereço. */
  withinCeiling: boolean;
}

/** Menor faixa mostrada ao cliente (evita "chega entre 0 e 20 min"). */
export const MIN_ETA_FROM_MIN = 5;

export function computeEta(config: EtaConfig, input: { distanceM: number; prepMin?: number | null }): EtaEstimate {
  const prepMin = input.prepMin ?? config.defaultPrepMin;
  const travelMin = Math.ceil(((input.distanceM / 1000) * (config.routeFactorPct / 100) * config.minPerKm) - 1e-9);
  const estimateMin = prepMin + config.dispatchMin + travelMin;
  return {
    estimateMin,
    fromMin: Math.max(MIN_ETA_FROM_MIN, estimateMin - config.bandMin),
    toMin: estimateMin + config.bandMin,
    prepMin,
    dispatchMin: config.dispatchMin,
    travelMin,
    withinCeiling: estimateMin <= config.maxMin,
  };
}

/** Distância máxima (m) que ainda cabe no teto para uma loja com este preparo; `0` se nem o preparo cabe. */
export function maxDistanceForCeilingM(config: EtaConfig, prepMin: number | null): number {
  const room = config.maxMin - (prepMin ?? config.defaultPrepMin) - config.dispatchMin;
  const perKm = (config.routeFactorPct / 100) * config.minPerKm;
  if (room <= 0 || perKm <= 0) return 0;
  return Math.floor((room / perKm) * 1000);
}

export interface EtaWindow {
  fromAt: Date;
  toAt: Date;
}

/** Faixa em horário de relógio a partir de `now` ("Chega entre 15:40 e 16:40"). */
export function etaWindow(estimate: Pick<EtaEstimate, 'fromMin' | 'toMin'>, now: Date): EtaWindow {
  return { fromAt: new Date(now.getTime() + estimate.fromMin * 60_000), toAt: new Date(now.getTime() + estimate.toMin * 60_000) };
}

/** Forma pública da faixa (contrato): minutos a partir de agora e horário de relógio ("Chega entre 15:40 e 16:40"). */
export interface EtaView {
  minMinutes: number;
  maxMinutes: number;
  fromAt: string;
  toAt: string;
}

export function presentEta(range: { minMinutes: number; maxMinutes: number }, now: Date): EtaView {
  const window = etaWindow({ fromMin: range.minMinutes, toMin: range.maxMinutes }, now);
  return { minMinutes: range.minMinutes, maxMinutes: range.maxMinutes, fromAt: window.fromAt.toISOString(), toAt: window.toAt.toISOString() };
}
