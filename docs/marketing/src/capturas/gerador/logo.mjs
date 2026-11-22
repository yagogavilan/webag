import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { sql, MODA } from './lib.mjs';
const sharp = createRequire('/home/user/webag/apps/api/package.json')('sharp');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect width="800" height="800" fill="#FFC93C"/>
<path d="M400 340 V300 C400 262 440 248 440 206 C440 160 392 140 354 172" fill="none" stroke="#1C1721" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M400 340 L160 520 C124 548 142 600 188 600 H612 C658 600 676 548 640 520 Z" fill="#1C1721"/>
<rect x="250" y="540" width="62" height="22" rx="11" fill="#D6FF4A"/><rect x="250" y="574" width="132" height="22" rx="11" fill="#D6FF4A" transform="translate(0 -2)"/>
</svg>`;
const png = await sharp(Buffer.from(svg)).png().toBuffer();
const owner = sql(`select owner_user_id from stores where id='${MODA}'`);
let id = sql(`select logo_asset_id from stores where id='${MODA}'`);
if (!id) {
  id = sql(`insert into media_assets (owner_user_id, store_id, purpose, status, object_key, declared_content_type, declared_size_bytes, content_type, size_bytes, width, height, variants, expires_at, completed_at) values ('${owner}', '${MODA}', 'store_logo', 'ready', 'seed/mkt-logo-moda', 'image/png', ${png.length}, 'image/png', ${png.length}, 800, 800, '{}', now(), now()) returning id`).split('\n')[0];
  sql(`update media_assets set variants = jsonb_build_object('160','media/${id}/160.webp','400','media/${id}/400.webp','800','media/${id}/800.webp') where id='${id}'`);
  sql(`update stores set logo_asset_id='${id}' where id='${MODA}'`);
}
for (const w of [800, 400, 160]) { mkdirSync(`/tmp/webag-mkt/s3/webag-public/media/${id}`, { recursive: true }); writeFileSync(`/tmp/webag-mkt/s3/webag-public/media/${id}/${w}.webp`, await sharp(png).resize({ width: w }).webp({ quality: 90 }).toBuffer()); }
console.log('logo', id);
