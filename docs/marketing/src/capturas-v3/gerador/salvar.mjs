// Salva a captura (PNG em memoria) como JPG qualidade 82 em docs/marketing/src/capturas-v3/ e avisa se passar de 400 KB.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const sharp = createRequire('/home/user/webag/apps/api/package.json')('sharp');
export const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function salvar(page, nome, opts = {}) {
  mkdirSync(OUT, { recursive: true });
  const png = await page.screenshot(opts);
  const jpg = await sharp(png).flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  writeFileSync(`${OUT}/${nome}.jpg`, jpg);
  console.log(nome, `${(jpg.length / 1024).toFixed(0)} KB`, jpg.length > 400 * 1024 ? 'ACIMA DE 400 KB' : '');
}
