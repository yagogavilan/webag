---
name: defaults-inseguros-e-armadilhas-de-api
description: Caçar configurações que falham aberto, valores padrão fracos e APIs fáceis de usar errado (NestJS, Zod, JWT, CORS, env, Expo, GitHub Actions, dependências) e decidir o que reportar. Use ao revisar config, módulos de infraestrutura e plataforma, ao projetar uma API interna e antes do G4 para varrer defaults de produção.
---

# Defaults inseguros e armadilhas de API

Duas perguntas: (1) **se ninguém configurar nada, o sistema fica seguro?** (2) **o caminho mais fácil de usar esta API é o seguro?** Documentar não desculpa: se o seguro exige ler o manual, é falha de desenho.

## 1. Fail-open x fail-secure
| Padrão no código | Veredito |
|---|---|
| `process.env.JWT_SECRET ?? 'dev'`, `\|\| 'changeme'` | **Fail-open**: roda com segredo conhecido. Reportar se algum ambiente pode subir assim |
| Leitura obrigatória que **derruba o boot** se faltar (validação Zod de env, SEC-080) | Fail-secure: não reportar |
| `REQUIRE_AUTH=false`, `RATE_LIMIT_ENABLED` default off, `PAYMENT_PROVIDER=fake` aceito em produção | Fail-open |
| Valor 0/vazio/null significando "sem limite" (TTL 0, tentativas 0) | Armadilha: 0 deve falhar na validação |
Dois tipos de candidato: **configurável** (fallback que só importa se rodar com ele) e **incondicional** (inseguro como escrito, ex.: `cors({ origin: true })`).

## 2. Varredura (6 categorias; use `Grep`, depois leia o contexto)
1. **Segredo com fallback:** `?? '`, `|| '` junto de `SECRET|KEY|TOKEN|PASSWORD`, chaves em `docker-compose`/Dockerfile/`apps/mobile` (`EXPO_PUBLIC_*` é público: nada sensível).
2. **Credencial padrão:** seed de admin/lojista em produção, senha/TOTP de exemplo, `.env.example` copiado sem trocar.
3. **Falha aberta de segurança:** `catch` vazio em verificação, assinatura de webhook "se existir", guard ausente por padrão (a rota deve ser **negada** a menos que marcada pública), verificação que passa com entrada malformada.
4. **Cripto fraca:** algoritmo escolhido pelo chamador (JWT `alg`), comparação de segredo sem tempo constante, hash rápido para senha (Argon2id é a decisão, SEC-001), `Math.random` para código/OTP.
5. **Acesso permissivo:** CORS aberto, DTO que aceita `role`/`status`/`price`, Zod `.passthrough()`, `TRUST_PROXY` mal configurado (IP forjável contorna rate limit), bucket/URL pública, rota de debug/aprovar PIX do `fake`, `/docs` e stack trace em produção.
6. **Recursos de debug:** logs verbosos, `NODE_ENV` ausente = dev, endpoints de teste, source maps com segredo.

## 3. Armadilhas de API (teste os três "adversários")
- **Malicioso** com controle da config: consegue desligar a proteção ou rebaixar algoritmo?
- **Preguiçoso** que copia o primeiro exemplo: o exemplo do README/outro módulo é seguro?
- **Confuso** que troca dois parâmetros: `string` igual para `userId`, `storeId`, `orderId` e segredo? Prefira tipos distintos (branded types) e funções sem booleanos de segurança.
Padrões a caçar: configuração "penhasco" (um typo desliga tudo), retorno booleano de verificação que ninguém checa, papel/permissão/SQL/URL montados como string solta, API com flag `insecure`/`skipVerify`.

## 4. Confirme antes de reportar (comece assumindo que é falso positivo)
O arquivo chega a produção? O valor inseguro realmente é usado (a produção define a variável)? Ele chega a uma decisão de segurança (cite a linha do uso)? Teste, fixture, `.env.example` com placeholder e compose de dev **não** contam, a menos que estejam no escopo pedido. Trace incompleto = "suspeita", com o que verificar. Severidade: Crítica se o uso óbvio é inseguro; Alta se erro fácil quebra a segurança; Média se exige configuração incomum.

## 5. Dependências e cadeia de suprimentos (visão rápida)
Lockfile versionado e `pnpm audit`; scripts de instalação restritos a lista permitida; ações do GitHub Actions por SHA e não por tag (DT-013); pacote com um único mantenedor, abandonado ou com nome parecido com outro (typosquatting); permissões do `GITHUB_TOKEN` mínimas. Dado indisponível é "não avaliado", não "ok". Nunca instale/execute pacote só para auditar.

## Fontes e licença
- Trail of Bits, repositório `trailofbits/skills` (https://github.com/trailofbits/skills), licença **CC BY-SA 4.0** (https://creativecommons.org/licenses/by-sa/4.0/), consultado em 2026-11-22: plugins `insecure-defaults` (lido pela página do plugin; o `SKILL.md` não pôde ser aberto), `sharp-edges` e `supply-chain-risk-auditor` (só os critérios).
- Adaptação em português, reescrita com palavras próprias, mudanças: categorias aplicadas a NestJS/Zod/Expo/Actions, exemplos do Webag e seção de dependências resumida. **Descartados:** scripts de coleta, agentes verificadores, consultas a registros externos. Obra derivada, **distribuída sob CC BY-SA 4.0**.
