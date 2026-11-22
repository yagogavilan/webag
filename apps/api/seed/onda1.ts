import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { desc, eq } from 'drizzle-orm';
import { PasswordService } from '../src/modules/identity/password.service.js';
import { initialTemplateFor } from '../src/modules/admin/category-templates.js';
import { FEATURE_FLAG_DEFINITIONS } from '../src/modules/admin/feature-flags.definitions.js';
import { fillCompanyVariables, forbiddenLegalVariables, resolveCompanyValues } from '../src/modules/admin/legal-variables.js';
import { PARAMETER_DEFINITIONS } from '../src/modules/admin/parameters.definitions.js';
import type { Db } from '../src/platform/database/database.module.js';
import {
  adminProfiles,
  auditLog,
  categories,
  cities,
  featureFlags,
  legalDocuments,
  neighborhoods,
  parameters,
  userRoles,
  users,
} from '../src/platform/database/schema.js';

/** Seed da Onda 1 (plano de execução §2d: um arquivo por onda). Idempotente: rodar de novo não duplica nem sobrescreve. */

const CITIES = [
  { name: 'Francisco Morato', slug: 'francisco-morato-sp', neighborhoods: ['Centro', 'Jardim Alegria', 'Vila Rosa', 'Jardim Dos Eucaliptos', 'Jardim Santa Rita'] },
  { name: 'Franco da Rocha', slug: 'franco-da-rocha-sp', neighborhoods: ['Centro', 'Vila Rosalina', 'Jardim Luciana', 'Vila Lanfranchi'] },
  { name: 'Caieiras', slug: 'caieiras-sp', neighborhoods: ['Centro', 'Laranjeiras', 'Jardim São Judas'] },
  { name: 'Campo Limpo Paulista', slug: 'campo-limpo-paulista-sp', neighborhoods: ['Centro', 'Jardim Bom Jesus', 'Vila Pires'] },
] as const;

const CATEGORIES: { name: string; icon: string; children: string[] }[] = [
  { name: 'Mercado', icon: 'basket', children: ['Hortifruti', 'Bebidas', 'Padaria', 'Açougue'] },
  { name: 'Farmácia', icon: 'pill', children: ['Medicamentos', 'Higiene', 'Cuidados pessoais'] },
  { name: 'Pet', icon: 'paw-print', children: ['Ração', 'Acessórios'] },
  { name: 'Casa e construção', icon: 'house', children: ['Utilidades', 'Ferramentas', 'Elétrica'] },
  { name: 'Moda e calçados', icon: 't-shirt', children: ['Roupas', 'Calçados', 'Acessórios'] },
  { name: 'Eletrônicos', icon: 'device-mobile', children: ['Celulares', 'Informática', 'Áudio'] },
  { name: 'Papelaria', icon: 'pencil', children: ['Material escolar', 'Escritório'] },
  { name: 'Brinquedos', icon: 'teddy-bear', children: [] },
];

/**
 * Textos legais do v1.0 (DEC-080/081): PROPOSTA do PO para o advogado do fundador, não texto aprovado. O trecho público de cada arquivo de
 * `docs/produto/legal/` foi copiado para `seed/legal/<tipo>.md` SEM os marcadores `[REVISAR JURÍDICO ...]` (procedimento do LEIA-ME §2).
 * SEC-187: ao GRAVAR a versão, o seed escreve no texto os valores de empresa (foro, encarregado, CNPJ...) lidos do ambiente; falta de valor
 * vira "a definir" (visível). Só `{{SITE_URL}}`, `{{VERSAO}}` e `{{VIGENCIA}}` ficam como variável. Depois de gravada, a versão não muda
 * com o ambiente: trocar um valor é uma versão nova, publicada pelo admin. Enquanto o jurídico não aprovar (J1 a J16), o site e o admin
 * mostram "Versão para revisão". Mudou o texto jurídico: mude em `docs/produto/legal/` e regenere.
 */
export const legalText = (type: string): string => readFileSync(new URL(`./legal/${type}.md`, import.meta.url), 'utf8').trim();

/** Primeira linha das minutas técnicas antigas (v1 do seed): só elas são substituídas pelo texto completo. */
const OLD_DRAFT_PREFIX = 'Minuta técnica de partida';
export const LEGAL_DOCS = [
  { type: 'customer_terms' as const, title: 'Termos de Uso' },
  { type: 'merchant_terms' as const, title: 'Termos do Lojista' },
  { type: 'privacy' as const, title: 'Política de Privacidade' },
  { type: 'exchange_policy' as const, title: 'Política de Trocas e Reembolsos' },
];

export interface SeedOptions {
  adminEmail?: string;
  adminPassword?: string;
  log?: (message: string) => void;
  /** Ambiente de onde vêm os valores de empresa dos textos legais (padrão `process.env`). */
  env?: Record<string, string | undefined>;
}

export async function seedOnda1(db: Db, options: SeedOptions = {}): Promise<void> {
  const log = options.log ?? (() => undefined);

  // Parâmetros e feature flags: só o que falta (não sobrescreve o que o admin editou).
  await db
    .insert(parameters)
    .values(PARAMETER_DEFINITIONS.map((definition) => ({ key: definition.key, value: definition.default })))
    .onConflictDoNothing();
  await db
    .insert(featureFlags)
    .values(FEATURE_FLAG_DEFINITIONS.map((flag) => ({ key: flag.key, enabled: flag.default, description: flag.description })))
    .onConflictDoNothing();
  log(`parâmetros (${PARAMETER_DEFINITIONS.length}) e feature flags (${FEATURE_FLAG_DEFINITIONS.length})`);

  // Regiões (DEC-009). Cidades já nascem ativas no seed de desenvolvimento.
  for (const city of CITIES) {
    await db.insert(cities).values({ name: city.name, slug: city.slug, state: 'SP', active: true }).onConflictDoNothing();
    const [row] = await db.select().from(cities).where(eq(cities.slug, city.slug));
    if (!row) continue;
    for (const name of city.neighborhoods) {
      await db.insert(neighborhoods).values({ cityId: row.id, name, active: true }).onConflictDoNothing();
    }
  }
  log(`${CITIES.length} cidades e bairros`);

  // Categorias de 2 níveis.
  let position = 0;
  for (const root of CATEGORIES) {
    const existing = (await db.select().from(categories)).find((c) => c.parentId === null && c.name === root.name);
    const rootId =
      existing?.id ??
      (await db.insert(categories).values({ name: root.name, icon: root.icon, position: position++ }).returning({ id: categories.id }))[0]?.id;
    if (!rootId) continue;
    let childPosition = 0;
    for (const child of root.children) {
      const found = (await db.select().from(categories)).find((c) => c.parentId === rootId && c.name === child);
      if (!found) await db.insert(categories).values({ name: child, icon: root.icon, parentId: rootId, position: childPosition });
      childPosition++;
    }
  }
  log(`${CATEGORIES.length} categorias`);

  // Modelos por categoria (WB-375, RN-Q6): só onde ainda não há modelo (o que o admin editou não é sobrescrito).
  const everyCategory = await db.select().from(categories);
  const nameById = new Map(everyCategory.map((c) => [c.id, c.name]));
  let templated = 0;
  for (const category of everyCategory) {
    if (category.template !== null) continue;
    const initial = initialTemplateFor(category.parentId ? (nameById.get(category.parentId) ?? null) : null, category.name);
    if (!initial) continue;
    await db.update(categories).set({ template: initial.template, descriptionRequired: initial.descriptionRequired, descriptionMinChars: 20 }).where(eq(categories.id, category.id));
    templated += 1;
  }
  log(`${templated} modelos de categoria`);

  // Textos legais: tipo sem versão ganha a v1 com o texto completo; tipo cuja última versão ainda é a minuta técnica antiga, ou que ainda traz
  // variável de empresa sem valor escrito (seed anterior ao SEC-187), ganha a versão seguinte (a anterior continua no histórico, imutável).
  // Mudança comum, não "relevante": ainda não há usuário real (pré-G5) e esses textos nunca foram aprovados pelo jurídico. Rodar de novo não
  // duplica nem reescreve: a versão gravada não acompanha mudança do ambiente.
  const company = resolveCompanyValues(options.env ?? process.env);
  for (const doc of LEGAL_DOCS) {
    const [latest] = await db.select().from(legalDocuments).where(eq(legalDocuments.type, doc.type)).orderBy(desc(legalDocuments.version)).limit(1);
    if (latest && !latest.content.startsWith(OLD_DRAFT_PREFIX) && forbiddenLegalVariables(latest.content).length === 0) continue;
    const content = fillCompanyVariables(legalText(doc.type), company.values);
    const forbidden = forbiddenLegalVariables(content);
    if (forbidden.length > 0) throw new Error(`Texto legal ${doc.type} com variável não permitida: ${forbidden.join(', ')}`);
    const [created] = await db
      .insert(legalDocuments)
      .values({
        type: doc.type,
        title: doc.title,
        content,
        version: (latest?.version ?? 0) + 1,
        // Vigência = data do seed (não uma data fixa já vencida). A data de vigência real é definida pelo admin ao publicar a versão aprovada.
        effectiveAt: new Date(),
        relevantChange: false,
        changeSummary: latest ? 'Texto completo proposto (versão para revisão jurídica), com os valores de empresa escritos no texto.' : null,
      })
      .returning();
    if (!created) continue;
    // Trilha: quais valores foram gravados nesta versão e quais ficaram "a definir" (os valores são os mesmos que o texto público mostra).
    await db.insert(auditLog).values({
      actorRole: 'system',
      action: 'legal.publish',
      targetType: 'legal_document',
      targetId: created.id,
      after: {
        type: created.type,
        version: created.version,
        relevantChange: false,
        effectiveAt: created.effectiveAt.toISOString(),
        source: 'seed',
        companyValues: company.values,
        pending: company.pending,
        contentSha256: createHash('sha256').update(created.content).digest('hex'),
      },
    });
    if (company.pending.length > 0) log(`${doc.type} v${created.version}: sem valor no ambiente, gravado "a definir": ${company.pending.join(', ')}`);
  }
  log('termos, privacidade e política de trocas (texto proposto, versão para revisão)');

  // Primeiro super admin: só se ainda não existir nenhum admin e houver senha explícita.
  const existingAdmins = await db.select({ id: adminProfiles.userId }).from(adminProfiles).limit(1);
  if (existingAdmins.length === 0 && options.adminEmail && options.adminPassword) {
    const passwords = new PasswordService();
    passwords.assertPolicy(options.adminPassword, 8);
    const [user] = await db
      .insert(users)
      .values({
        email: options.adminEmail.toLowerCase(),
        name: 'Super Admin',
        passwordHash: await passwords.hash(options.adminPassword),
        emailVerifiedAt: new Date(),
      })
      .returning({ id: users.id });
    if (user) {
      await db.insert(userRoles).values({ userId: user.id, role: 'customer' });
      await db.insert(adminProfiles).values({ userId: user.id, profile: 'super_admin' });
      log(`super admin ${options.adminEmail} criado (configure o TOTP no primeiro login)`);
    }
  } else if (existingAdmins.length === 0) {
    log('nenhum admin criado: defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD');
  }
}
