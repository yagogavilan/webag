import { readFileSync } from 'node:fs';
import { writeArt } from './produtos.mjs';
const map = {};
for (const line of readFileSync('/tmp/webag-mkt/sheet/list.txt', 'utf8').split('\n')) {
  const [store, name, asset] = line.split('|');
  if (store === 'Moda Express Franco') map[name] = asset;
}
await writeArt('/tmp/webag-mkt/s3/webag-public/media', map);
console.log(map);
