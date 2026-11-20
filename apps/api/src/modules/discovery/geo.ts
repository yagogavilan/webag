import { sql } from 'drizzle-orm';
import { z } from 'zod';

/** Ponto de consulta (endereço do cliente). Chega por query string e nunca vai a log com coordenada (ver app.module). */
export interface GeoPoint {
  lat: number;
  lng: number;
}

export const geoQuery = {
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
};

/** Ponto PostGIS `geography(Point,4326)` (lng, lat, nessa ordem). */
export const pointSql = (point: GeoPoint) => sql`ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography`;

/** Chave de cache: 6 casas decimais (~0,1 m). Cache só reaproveita a MESMA posição, nunca aproxima (borda do raio é exata). */
export const pointKey = (point: GeoPoint): string => `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
