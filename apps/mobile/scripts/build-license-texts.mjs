#!/usr/bin/env node
// Gera src/legal/license-texts.ts com o texto INTEGRAL das licenças das fontes, copiado dos arquivos dos pacotes (nunca redigitado,
// docs/design/telas/onda-7-licencas.md §0). Rode depois de atualizar `@expo-google-fonts/*`:  pnpm --filter @webag/mobile assets:licenses
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (pkg) => readFileSync(resolve(here, '../node_modules/@expo-google-fonts', pkg, 'LICENSE_FONT'), 'utf8').trim();

const out = `// GERADO por scripts/build-license-texts.mjs a partir do LICENSE_FONT de cada pacote. Não edite à mão.
export const OFL_BRICOLAGE = ${JSON.stringify(read('bricolage-grotesque'))};

export const OFL_FIGTREE = ${JSON.stringify(read('figtree'))};
`;
writeFileSync(resolve(here, '../src/legal/license-texts.ts'), out);
console.log('src/legal/license-texts.ts gerado');
