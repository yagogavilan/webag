import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

/** Estado entre os specs (a loja nasce no 01, é aprovada no 02 e tem produto moderado no 03). Em diretório temporário (o Playwright apaga `test-results/` a cada execução). */
export interface RealState {
  merchantEmail: string;
  merchantPassword: string;
  storeId: string;
  storeName: string;
  productId?: string;
  productName?: string;
}
const API = (process.env.REAL_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const FILE = resolve(tmpdir(), 'webag-e2e-real', createHash('sha1').update(API).digest('hex').slice(0, 8), 'real-flow.json');

export function saveState(state: RealState): void {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(state));
}

export function loadState(): RealState {
  if (!existsSync(FILE)) throw new Error('Estado ausente: rode o spec 01-cadastrar-loja antes (os specs 01, 02 e 03 formam uma sequência).');
  return JSON.parse(readFileSync(FILE, 'utf8')) as RealState;
}
