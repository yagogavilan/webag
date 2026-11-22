// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Trava do BUG-041: módulo de servidor (qualquer arquivo de `app/` e de `src/` sem 'use client') não pode importar de um módulo
 * 'use client' nada além de componentes (PascalCase) e tipos. O Next transforma o export de um módulo cliente em uma referência: chamar
 * `isStoreTab()` numa página de servidor quebra só em execução (o `next build` passa e o teste de componente também).
 * Funções puras, constantes e hooks vão para um módulo sem 'use client', importado pelos dois lados.
 * Vale também por barril (`export * from`). Limite: não analisa o uso, só o nome importado; componente em PascalCase passa.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSIONS = ['.ts', '.tsx'];

type Files = Record<string, string>;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(spec|test|e2e)\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

const isClient = (source: string) => /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(source);

/** Componente = começa em maiúscula e tem alguma minúscula (`StoreDetail`); `T`, `KEEPS_RUNNING` e `isStoreTab` não são. */
const isComponentName = (name: string) => /^[A-Z]/.test(name) && /[a-z]/.test(name);

function resolveModule(files: Files, from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(root, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  const candidates = [base, ...EXTENSIONS.map((e) => base + e), ...EXTENSIONS.map((e) => join(base, 'index' + e))];
  return candidates.find((c) => c in files) ?? null;
}

const parse = (file: string, text: string) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** O módulo declara `export` com esse nome (declaração, lista `export { a }` ou re-export)? `export *` de outro módulo conta como sim. */
function exportsName(statements: ts.NodeArray<ts.Statement>, name: string): boolean {
  return statements.some((node) => {
    if (ts.isExportDeclaration(node)) {
      if (node.isTypeOnly) return false;
      if (!node.exportClause) return true;
      return ts.isNamedExports(node.exportClause) && node.exportClause.elements.some((e) => !e.isTypeOnly && e.name.text === name);
    }
    if (!ts.getModifiers(node as ts.HasModifiers)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return false;
    if (ts.isVariableStatement(node)) return node.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name);
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) return node.name?.text === name;
    return false;
  });
}

/** Onde `name` é definido? Segue barris (`export * from`, `export { name } from`). Devolve o arquivo 'use client' de origem, se for esse o caso. */
function clientOrigin(files: Files, file: string, name: string, seen = new Set<string>()): string | null {
  if (seen.has(file)) return null;
  seen.add(file);
  const statements = parse(file, files[file]!).statements;
  if (isClient(files[file]!)) return exportsName(statements, name) ? file : null;
  for (const node of statements) {
    if (!ts.isExportDeclaration(node) || !node.moduleSpecifier || node.isTypeOnly) continue;
    const target = resolveModule(files, file, (node.moduleSpecifier as ts.StringLiteral).text);
    if (!target) continue;
    const clause = node.exportClause;
    if (clause && ts.isNamedExports(clause)) {
      const el = clause.elements.find((e) => !e.isTypeOnly && e.name.text === name);
      if (el) return clientOrigin(files, target, (el.propertyName ?? el.name).text, seen);
    } else if (!clause) {
      const found = clientOrigin(files, target, name, seen);
      if (found) return found;
    }
  }
  return null;
}

export function findViolations(files: Files): string[] {
  const violations: string[] = [];
  for (const [file, text] of Object.entries(files)) {
    if (isClient(text)) continue;
    for (const node of parse(file, text).statements) {
      if (!ts.isImportDeclaration(node)) continue;
      const clause = node.importClause;
      if (!clause || clause.isTypeOnly) continue;
      const target = resolveModule(files, file, (node.moduleSpecifier as ts.StringLiteral).text);
      if (!target) continue;
      const names: string[] = [];
      if (clause.name) names.push('default');
      const b = clause.namedBindings;
      if (b && ts.isNamespaceImport(b)) names.push(`* as ${b.name.text}`);
      if (b && ts.isNamedImports(b)) for (const el of b.elements) if (!el.isTypeOnly) names.push((el.propertyName ?? el.name).text);
      for (const name of names) {
        if (name === 'default' || isComponentName(name)) continue;
        const origin = name.startsWith('* as') ? (isClient(files[target]!) ? target : null) : clientOrigin(files, target, name);
        if (origin) violations.push(`${relative(root, file)} importa "${name}" de ${relative(root, origin)} ('use client'): mova para um módulo sem 'use client'`);
      }
    }
  }
  return violations;
}

describe('fronteira servidor/cliente (BUG-041)', () => {
  it('módulos de servidor só importam componentes e tipos de módulos "use client"', () => {
    const files: Files = {};
    for (const f of [...walk(join(root, 'app')), ...walk(join(root, 'src'))]) files[f] = readFileSync(f, 'utf8');
    expect(Object.keys(files).length).toBeGreaterThan(100);
    expect(findViolations(files)).toEqual([]);
  });

  it('a trava enxerga o padrão do BUG-041, também por barril, e deixa passar componente, tipo e módulo puro', () => {
    const p = (f: string) => join(root, f);
    const fake: Files = {
      [p('app/x/page.tsx')]: "import { Tela, isTab, type TabId } from '@/features/tela';\nexport default function P() { return <Tela tab={isTab('a')} />; }",
      [p('app/y/page.tsx')]: "import { isTab } from '@/features/tela-tabs';\nimport { Tela } from '@/features/tela';\nexport default () => <Tela tab={isTab('a')} />;",
      [p('app/z/page.tsx')]: "import { useThing } from '@/features/barrel';\nexport default () => useThing();",
      [p('src/features/tela.tsx')]: "'use client';\nexport type TabId = 'a';\nexport const isTab = (v: string) => v === 'a';\nexport function Tela(_: { tab: boolean }) { return null; }",
      [p('src/features/tela-tabs.ts')]: "export const isTab = (v: string) => v === 'a';",
      [p('src/features/barrel.ts')]: "export * from './hooks';",
      [p('src/features/hooks.ts')]: "'use client';\nexport const useThing = () => 1;",
    };
    const out = findViolations(fake);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('app/x/page.tsx importa "isTab" de src/features/tela.tsx');
    expect(out[1]).toContain('app/z/page.tsx importa "useThing" de src/features/hooks.ts');
  });
});
