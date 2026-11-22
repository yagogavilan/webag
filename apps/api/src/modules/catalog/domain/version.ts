import { errors } from '../../../platform/http/app-error.js';

/** `If-Match: "7"` (RFC 9110; o mesmo valor vem em `ETag`). Ausente = grava sem conferir (compatível com o app 1.0); formato inválido = 400. */
const IF_MATCH = /^"([1-9][0-9]{0,9})"$/;

export function parseIfMatch(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null;
  const match = IF_MATCH.exec(raw);
  if (!match) throw errors.validation([{ field: 'If-Match', message: 'Use a versão do produto entre aspas, como "7".' }]);
  return Number(match[1]);
}

export const etag = (version: number): string => `"${version}"`;
