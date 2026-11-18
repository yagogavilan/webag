# Dívida técnica — Webag

Dono: tech-lead. Cada item: o que é, impacto, custo de pagar e gatilho de quando pagar. Origem aponta o ADR ou review que criou o item.

| ID | Item | Impacto | Custo de pagar | Quando | Origem | Status |
|---|---|---|---|---|---|---|
| DT-001 | Drizzle ORM 0.45 (pré-1.0); a 1.0 muda a API do relational query | Migração de consultas relacionais quando atualizar | M (1–2 dias, depende do volume de `db.query.*`) | Drizzle 1.0 GA + 1 patch; preferir `select()` explícito até lá | ADR-001 | Aberta |
| DT-002 | TypeScript 6.0 em vez de 7.0 (typescript-eslint 8.73 só aceita `<6.1`) | Sem ganho de velocidade do TS 7 | P (trocar versão + ajustes) | typescript-eslint publicar suporte a TS 7 | ADR-001 | Aberta |
| DT-003 | `@nest-lab/throttler-storage-redis` declara peer até Nest 11 | Rate limit distribuído pode quebrar no Nest 12 | P (testar ou storage próprio ~40 linhas) | Ao implementar rate limit (auth/OTP) | ADR-003 | Aberta |
| DT-004 | Sem outbox: eventos de domínio saem depois do commit, best-effort | Push/e-mail/socket podem se perder em queda entre commit e enfileirar; estado sempre recuperável por REST | M (tabela outbox + relay) | Primeiro incidente de evento perdido em pagamento ou > 1 instância da API | ADR-004, ADR-007 | Aceita |
| DT-005 | Sem antivírus em PDF de documento de loja | Arquivo malicioso armazenado (só admin abre) | M (ClamAV em job) | Parecer do security-engineer | ADR-005 | Aberta |
| DT-006 | Maestro fora do CI de PR (custo/tempo de emulador) | Regressão de fluxo mobile só aparece no ciclo de release | M | Antes do G4 rodar em todo release candidate | ADR-006 | Aceita |
| DT-007 | Frete por distância em linha reta | Subestima rotas com morro/rodovia | M (API de rotas paga) | Reclamação recorrente de lojista sobre frete | ADR-008 | Aceita |
| DT-008 | `.claude/settings.json` nega `.env.*` (inclui `.env.example`); a permissão também bloqueou criar o arquivo. Modelo hoje em `infra/env.example`; o brief §8 pede `.env.example` na raiz | Desvio do "clone + `.env.example` → `.env`" da definição de pronto | P | Antes do G4: CEO libera `Read/Write(./.env.example)` no settings (com aval do fundador) **ou** cria a cópia na raiz e o CI passa a comparar as duas (`cmp`) | Esqueleto | Aberta (CEO) |
| DT-009 | Skills `padroes-backend` (Prisma, Jest) e `padroes-mobile` (NativeWind) desatualizadas frente ao ADR-001 (Drizzle, Vitest, StyleSheet + tokens) | Agentes podem seguir a skill e contrariar o ADR | P (editar 2 arquivos) | Já: o CEO atualiza (tech-lead não altera configuração do time) | ADR-001 | Aberta (CEO) |
| DT-010 | `packages/tokens` usa TypeScript `^5.6` e não tem `lint`/`test` | Typecheck do pacote com compilador diferente do resto | P | Próxima mudança do product-designer no pacote | Esqueleto | Aberta (designer) |
| DT-011 | Tailwind 4 decidido no ADR-001 mas não instalado no esqueleto do `apps/web` (usa só variáveis `--wb-*`) | Nenhum até a primeira tela densa | P (instalar + mapear `@theme`) | Primeira história de tela do painel | Esqueleto | Aberta (mobile-dev) |
