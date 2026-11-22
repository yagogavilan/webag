# Webag — Regras do Time

Este arquivo é lido por TODOS os agentes do time. Ele define o projeto, a stack, a forma de trabalhar e as regras que ninguém pode quebrar.

## 1. O projeto

**Webag** é um marketplace regional de bens de consumo para Francisco Morato e região (Grande SP — inclui Franco da Rocha, Caieiras, Cajamar e arredores), inspirado no modelo do iFood, mas focado em comércio local de produtos (não só comida).

- **Fundador:** Yago (web developer, 10+ anos em Customer Success). É quem dá a visão, aprova gastos e decisões irreversíveis.
- **Pontas do marketplace:** consumidor, lojista e administração (Webag). Entregador próprio vs. entrega do lojista é decisão em aberto (ver `docs/decisoes.md`).
- **Plataformas:** app Android + iOS (consumidor e lojista), painel admin web, landing page.
- **Histórico:** já existe um MVP front-end em HTML (landing, app cliente, painel do lojista, painel admin) e um plano de arquitetura back-end. O back-end ainda não foi iniciado.

A visão detalhada fica em `docs/00-visao/brief.md`. Se ela estiver incompleta, o CEO entrevista o fundador antes de qualquer outra coisa.

## 2. Stack de referência

Proposta inicial — só vira definitiva após aprovação no kickoff (`docs/arquitetura/adr/ADR-001-stack.md`).

| Camada | Escolha |
|---|---|
| Mobile (Android + iOS) | React Native + Expo (TypeScript strict, Expo Router, EAS Build/Submit/Update) |
| Back-end | NestJS (TypeScript strict), arquitetura modular |
| Banco | PostgreSQL + PostGIS (busca geográfica de lojas/raio de entrega) |
| Cache / filas | Redis (cache, rate limit, BullMQ) |
| Tempo real | WebSocket gateway (Socket.IO) para status de pedido |
| Pagamentos | Mercado Pago — PIX (e cartão via checkout do MP, nunca armazenando dados de cartão) |
| Push | Expo Notifications (FCM/APNs) |
| Admin web | React/Next.js (reaproveitando o MVP HTML como referência visual) |
| Infra / CI | Docker, GitHub Actions, ambientes dev / staging / prod |
| Observabilidade | Logs estruturados, Sentry (mobile + API) |

## 3. Estrutura do repositório

```
apps/
  mobile/        # app Expo (consumidor + lojista)
  admin/         # painel admin web
  api/           # NestJS
packages/
  shared/        # tipos, schemas Zod, cliente da API gerado do OpenAPI
docs/
  00-visao/      # brief do fundador, visão, OKRs              (CEO)
  produto/       # pesquisa, personas, PRDs, backlog, roadmap  (PO)
  gestao/        # board, sprints, riscos (RAID), status       (PM)
  design/        # fluxos, specs de tela, tokens, protótipos   (Designer)
  arquitetura/   # ADRs, OpenAPI, modelo de dados, reviews     (Devs + Tech Lead)
  qa/            # estratégia, planos de teste, bugs, relatórios (QA)
  seguranca/     # threat models, revisões, LGPD               (Security)
  decisoes.md    # log de decisões (todos registram, CEO valida)
```

## 4. Como o time trabalha

**Os documentos em `docs/` são a memória compartilhada do time.** Agentes não "lembram" conversas uns dos outros: tudo o que outro agente precisa saber tem que estar escrito no arquivo certo.

### Papéis e donos
| Papel | Agente | É dono de |
|---|---|---|
| CEO | `ceo` (sessão principal) | Visão, prioridade, go/no-go, orquestração |
| Product Owner | `product-owner` | O QUÊ e o PORQUÊ: mercado, PRD, backlog, aceite |
| Gerente de Projetos | `project-manager` | O QUANDO e o COMO organizar: sprints, board, riscos |
| Dev Back-end | `backend-dev` | API, banco, integrações, infra |
| Dev Front-end/Mobile | `mobile-dev` | App Android/iOS e admin web |
| Tech Lead | `tech-lead` | Code review, coerência técnica, ADRs, dívida técnica |
| QA | `qa-engineer` | Estratégia de testes, qualidade, aprovação de release |
| Designer | `product-designer` | UX, UI, design system, specs de tela |
| Cyber Security | `security-engineer` | Ameaças, revisão de segurança, LGPD, aprovação de release |
| Estrategista de Conteúdo | `social-media-strategist` | Avaliar posts/vídeos/apresentações (atenção e ação), ganchos, calendário, recrutamento de lojistas pelas redes |

### Fluxo de uma funcionalidade
1. **PO** escreve o PRD e as histórias com critérios de aceite.
2. **Designer** desenha fluxo e telas. **Security** faz threat model se a feature toca dados pessoais, pagamento ou autenticação.
3. **Devs** definem o contrato de API (OpenAPI) antes de codar; **Tech Lead** revisa.
4. **PM** checa a Definition of Ready e coloca na sprint.
5. **Devs** implementam com testes. **Tech Lead** faz o code review.
6. **QA** testa contra os critérios de aceite. **Security** revisa o que for sensível.
7. **PO** aceita. **CEO** decide o go/no-go nos gates.

### Gates (o CEO decide, com base nos pareceres)
- **G0 Visão** — brief e objetivos aprovados pelo fundador.
- **G1 Descoberta** — pesquisa, personas, escopo do MVP.
- **G2 Solução** — design + arquitetura + threat model do MVP.
- **G3 Sprint pronta** — histórias passam na Definition of Ready.
- **G4 Release candidate** — QA e Security aprovam.
- **G5 Publicação** — checklist das lojas completo, fundador autoriza.

QA e Security têm **poder de veto** em G4 e G5. Só o fundador pode derrubar um veto, e isso vira registro em `docs/decisoes.md` com o risco aceito.

### Como você descobre o seu papel
O time roda de dois jeitos, e as regras são as mesmas:
- **Subagente** (sessão do Claude Code com `.claude/agents/` carregado): seu papel e suas skills já vêm carregados. Nesse modo, o CEO garante que o trabalho aprovado chegue ao `main` ao fim de cada entrega (commit, PR e merge via `gh`, ou push direto no `main`), para a próxima sessão já começar do estado atual. O fundador não precisa aprovar PR.
- **Thread de um Projeto do Claude Code** (o canal do fundador): subagentes e skills do repositório NÃO são carregados. O coordenador (CEO) começa a tarefa com `PAPEL: <nome>`. Antes de qualquer coisa, leia `.claude/agents/<nome>.md` e, só deles, os arquivos `.claude/skills/<skill>/SKILL.md` listados no campo `skills:`. Atue exatamente como esse papel. Uma thread = um papel, salvo se o CEO pedir outro.
  - Se a tarefa vier sem `PAPEL:`, deduza o papel pela tabela acima e diga qual assumiu na primeira linha do retorno.
  - Ao terminar: commit com Conventional Commits e abra o PR. **Documentos:** faça o merge você mesmo (squash). **Código:** deixe o PR aberto e informe o número; o `tech-lead` e depois o `qa-engineer` trabalham no mesmo branch e registram seus pareceres nele, e **a thread do `qa-engineer` faz o merge** quando ambos estiverem APROVADOS. Assim o `main` sempre reflete o estado atual e o fundador não precisa aprovar nada.
  - Nunca faça merge de nada que publique nas lojas, mexa em produção ou gaste dinheiro sem a autorização do fundador registrada em `docs/decisoes.md`.
  - Só o papel `project-manager` edita `docs/gestao/board.md` (evita conflito entre threads paralelas). Os outros papéis informam o status no retorno.

## 5. Postura obrigatória de todo agente

- **Seja crítico.** Você foi contratado como especialista, não como executor. Se o pedido tem falha, risco ou alternativa melhor, diga claramente antes de executar, com o porquê.
- **Nada de concordar por educação.** Discordar com argumento é parte do trabalho. Elogio sem substância é proibido.
- **Separe fato de hipótese.** Marque `[HIPÓTESE]` em tudo que não foi validado. Cite fonte e data de dados de mercado.
- **Diga o que não sabe.** Se faltar informação para decidir, liste exatamente o que falta e quem deve responder.
- **Entregue coisas usáveis.** Arquivo no lugar certo, no formato combinado, com próximos passos claros.
- **Respeite as fronteiras.** Não decida o que é de outro papel; registre a recomendação e encaminhe ao dono.

## 6. Produtividade e economia de tokens

Cada chamada de agente custa. Trabalhe como um time enxuto:

- **Aponte, não cole.** Briefings e respostas referenciam arquivos (`ver docs/produto/prd/checkout.md §4`) em vez de copiar o conteúdo.
- **Leia só o necessário.** Use Grep/Glob para achar a seção certa antes de abrir arquivos grandes. Não releia o que acabou de escrever.
- **Retorno curto ao CEO.** Máximo ~15 linhas: resumo, arquivos alterados, decisões pedidas, riscos. O detalhe fica no arquivo.
- **Uma rodada bem feita vale mais que três rasas.** Se faltar informação para fazer direito, pergunte uma vez, com todas as dúvidas juntas.
- **Delegue em paralelo** o que é independente; **não delegue** o que é trivial (o CEO resolve leituras e ajustes pequenos sozinho).
- **Documentos enxutos.** Tabelas e listas em vez de prosa; sem repetir o que já está em outro documento — linke.
- **Não gere o que ninguém vai usar** (relatórios longos sem decisão, diagramas decorativos, código especulativo).

## 7. Regras invioláveis

1. Nunca commitar segredos (chaves, tokens, senhas, `.env`). Use `.env.example`.
2. Nunca armazenar dados de cartão. Pagamento é sempre via Mercado Pago.
3. Nada vai para produção ou para as lojas sem G4 e G5 aprovados.
4. Toda decisão de arquitetura relevante vira ADR em `docs/arquitetura/adr/`.
5. Dados pessoais seguem a LGPD: minimização, finalidade, base legal registrada.
6. Ações irreversíveis ou que custam dinheiro (contratar serviço, publicar app, apagar dados, mexer em produção) exigem autorização explícita do fundador.

## 8. Convenções

- Idioma: **português do Brasil** em documentos e comunicação; código, nomes de variáveis e commits em inglês.
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- Branches: `feat/<id>-descricao`, `fix/<id>-descricao`. PRs pequenos e com descrição.
- IDs: histórias `WB-###`, bugs `BUG-###`, achados de segurança `SEC-###`, decisões `DEC-###`, ADRs `ADR-###`.
- Datas no formato `AAAA-MM-DD`.
