import { eq } from 'drizzle-orm';
import { PasswordService } from '../src/modules/identity/password.service.js';
import { FEATURE_FLAG_DEFINITIONS } from '../src/modules/admin/feature-flags.definitions.js';
import { PARAMETER_DEFINITIONS } from '../src/modules/admin/parameters.definitions.js';
import type { Db } from '../src/platform/database/database.module.js';
import {
  adminProfiles,
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

/** Minutas técnicas de partida. A revisão jurídica é pendência para o G5 (plano de execução §6). */
const DRAFT_NOTICE = 'Minuta técnica de partida, sujeita a revisão jurídica antes da publicação nas lojas.';
const LEGAL_DRAFTS = [
  {
    type: 'customer_terms' as const,
    title: 'Termos de Uso',
    content: `${DRAFT_NOTICE}\n\n1. O Webag conecta você a lojas da sua região. A compra é feita com a loja; o Webag intermedia o pedido e o pagamento.\n2. Você precisa ter 18 anos ou mais e informar dados verdadeiros.\n3. Pagamento por PIX ou cartão, processado pelo Mercado Pago; o Webag não guarda dados de cartão.\n4. Trocas e arrependimento seguem o Código de Defesa do Consumidor: 7 dias de arrependimento nas compras à distância e a garantia legal por defeito.\n5. Você pode excluir sua conta a qualquer momento pelo app.`,
  },
  {
    type: 'merchant_terms' as const,
    title: 'Termos do Lojista',
    content: `${DRAFT_NOTICE}\n\n1. O lojista é responsável pelos produtos, preços, estoque, emissão de documento fiscal e pela entrega dos pedidos.\n2. A comissão da plataforma e as taxas do provedor de pagamento são exibidas antes da ativação da loja.\n3. O lojista é controlador dos dados do cliente que recebe para entregar o pedido, e deve usá-los só para essa finalidade.\n4. Estornos pagos ao cliente por falha do lojista podem ser cobrados do lojista conforme este contrato.\n5. O Webag pode suspender lojas por descumprimento destes termos.`,
  },
  {
    type: 'privacy' as const,
    title: 'Política de Privacidade',
    content: `${DRAFT_NOTICE}\n\nUsamos seus dados para criar sua conta, processar pedidos e pagamentos, cumprir obrigações legais e proteger a plataforma contra fraude.\nColetamos só o necessário: nome, e-mail, celular e endereço de entrega quando você faz um pedido. Não coletamos CPF nem data de nascimento no cadastro.\nMarketing, localização precisa e lista de espera dependem do seu consentimento, que você pode retirar a qualquer momento em Conta.\nVocê pode pedir acesso, correção, exportação e exclusão dos seus dados pelo app.`,
  },
];

export interface SeedOptions {
  adminEmail?: string;
  adminPassword?: string;
  log?: (message: string) => void;
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

  // Termos e privacidade v1 (só se o tipo ainda não tem versão).
  for (const draft of LEGAL_DRAFTS) {
    const [existing] = await db.select().from(legalDocuments).where(eq(legalDocuments.type, draft.type)).limit(1);
    if (existing) continue;
    await db.insert(legalDocuments).values({ ...draft, version: 1, effectiveAt: new Date('2026-01-01T00:00:00Z'), relevantChange: false });
  }
  log('termos e privacidade (minuta v1)');

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
