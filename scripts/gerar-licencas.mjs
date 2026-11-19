#!/usr/bin/env node
// Gera docs/legal/dependencias-npm.md: lista de TODAS as dependências npm de produção (API, web, app, pacotes) com versão e
// licença, um resumo por licença e a lista das que exigem atenção (copyleft ou "source-available").
// Uso: pnpm licencas   (rode depois de mudar dependências e antes de cada release; revise a seção "Atenção" nos avisos).
// Lê `pnpm licenses list --prod --json`; precisa do `pnpm install` feito.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args) => {
  const result = spawnSync('pnpm', ['licenses', 'list', '--json', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, shell: process.platform === 'win32' });
  if (result.status !== 0) {
    console.error(result.stderr || 'pnpm licenses falhou (rodou pnpm install?)');
    process.exit(1);
  }
  return JSON.parse(result.stdout);
};

const prod = run(['--prod']);
const all = run([]);

// Licenças que pedem atenção. GPL/AGPL/SSPL: copyleft forte (proibido em código distribuído sem revisão jurídica).
// LGPL/MPL/EPL/CDDL: copyleft fraco (ok sem modificar e sem embutir). FSL/BUSL: código aberto com restrição de uso (ok se não competir).
// CC-BY: exige atribuição. Expressões com "OR" que oferecem alternativa permissiva (ex.: BSD OR GPL) são anotadas, não bloqueiam.
const attention = [
  { test: /AGPL|SSPL|(^|[^L])GPL-|^GPL/i, level: 'COPYLEFT FORTE' },
  { test: /LGPL|MPL|EPL|CDDL|EUPL/i, level: 'copyleft fraco' },
  { test: /FSL|BUSL|Elastic|Commons-Clause|CC-BY-NC|CC-BY-ND/i, level: 'restrição de uso' },
  { test: /^CC-BY-[0-9]/i, level: 'atribuição' },
];
const classify = (license) => {
  const hit = attention.find((a) => a.test.test(license));
  if (!hit) return null;
  if (/ OR /.test(license) && /MIT|BSD|Apache|ISC/.test(license)) return 'alternativa permissiva (escolher a permissiva)';
  return hit.level;
};

const rows = [];
for (const [license, packages] of Object.entries(prod)) {
  for (const pkg of packages) for (const version of pkg.versions) rows.push({ name: pkg.name, version, license });
}
rows.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version, undefined, { numeric: true }));

const summary = (data) =>
  Object.entries(data)
    .map(([license, packages]) => [license, packages.reduce((n, p) => n + p.versions.length, 0)])
    .sort((a, b) => b[1] - a[1]);

const flagged = rows.map((r) => ({ ...r, level: classify(r.license) })).filter((r) => r.level);
const strong = flagged.filter((r) => r.level === 'COPYLEFT FORTE');

const lines = [
  '# Dependências npm e licenças',
  '',
  '> Gerado por `pnpm licencas` (`scripts/gerar-licencas.mjs`) a partir de `pnpm licenses list --prod`. Não edite à mão: rode de novo depois de mudar dependências.',
  `> Pacotes de produção (API, painéis web, app e pacotes compartilhados): ${rows.length} versões. Com as ferramentas de desenvolvimento: ${summary(all).reduce((n, [, c]) => n + c, 0)}.`,
  '',
  `## Resultado da triagem: ${strong.length === 0 ? 'nenhuma licença de copyleft forte (GPL, AGPL, SSPL) em produção' : `ATENÇÃO, ${strong.length} pacote(s) com copyleft forte`}`,
  '',
  '## Resumo por licença (produção)',
  '',
  '| Licença | Pacotes |',
  '|---|---|',
  ...summary(prod).map(([license, count]) => `| ${license} | ${count} |`),
  '',
  '## Atenção (copyleft, restrição de uso ou atribuição)',
  '',
  flagged.length === 0 ? 'Nenhuma.' : '| Pacote | Versão | Licença | Tipo |\n|---|---|---|---|',
  ...flagged.map((r) => `| ${r.name} | ${r.version} | ${r.license} | ${r.level} |`),
  '',
  'A análise de cada item (uso, risco, obrigação) está em `THIRD_PARTY_NOTICES.md`, seção "Triagem de licenças das dependências".',
  '',
  '## Lista completa (produção)',
  '',
  '| Pacote | Versão | Licença |',
  '|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${r.version} | ${r.license} |`),
  '',
];

const out = resolve(root, 'docs/legal/dependencias-npm.md');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join('\n'));
console.log(`docs/legal/dependencias-npm.md: ${rows.length} pacotes, ${flagged.length} para atenção, ${strong.length} copyleft forte`);
process.exit(strong.length === 0 ? 0 : 2);
