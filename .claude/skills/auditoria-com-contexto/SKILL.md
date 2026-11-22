---
name: auditoria-com-contexto
description: Entender o código a fundo antes de procurar falhas (invariantes, premissas sem garantia, quem alcança o quê), com dossiê por módulo do Webag. Use ao começar a auditar um módulo desconhecido, ao preparar threat model de um fluxo de código existente ou quando achados anteriores não puderam ser julgados por falta de mapa do sistema.
---

# Auditoria com contexto (entender primeiro, achar falha depois)

Fase de **compreensão**: não nomeie vulnerabilidade, não proponha correção, não dê severidade. Produza um mapa que a fase de caça (outras skills, `checklist-seguranca`) usa depois. Pular esta fase gera falso positivo (você não viu o guard global) e falso negativo (não viu a premissa que ninguém garante).

## 1. Orientar (15 min)
- Leia `docs/arquitetura/adr/ADR-007` (módulos) e o `index.ts` do módulo: o que ele promete ao resto do sistema.
- Liste pontos de entrada: controllers e rotas no `openapi.yaml`, handlers de webhook, gateways Socket.IO, jobs de fila, timers, BFF do `apps/web/src/server/`, CLI de break-glass.
- Liste o que roda **antes** do seu código e não aparece no arquivo: guards globais, pipes de validação Zod, interceptor de idempotência, `@Transactional()`, rate limit, middleware de `requestId`. Se não achou onde ficam, é pergunta aberta, não "provavelmente existe".

## 2. Registro por função (as que tocam dinheiro, dado pessoal, auth, estado do pedido)
Siga as **chamadas**, inclusive caminhos de erro, não só o feliz. Para cada função:
| Campo | O que escrever | Regra |
|---|---|---|
| Invariantes | O que sempre vale (ex.: "valor cobrado = soma calculada no servidor") | Cada uma cita `arquivo:linha` que a mostra |
| Premissas | O que a função assume sem verificar (ex.: "o `orderId` já pertence ao usuário") | Para cada uma, o que a garante, ou **`nada encontrado`** |
| Chamadas | Quem ela chama e o que exige de cada um | Leia o chamado; não adivinhe pelo nome |
| Dúvidas | O que ficou sem resposta | Não feche por inferência |
Toda afirmação tem linha de código ou vira dúvida. Termos: **"nada encontrado"** só quando você procurou (Grep, chamadores, banco) e não achou.

## 3. Dossiê do módulo (`docs/seguranca/contexto/<modulo>.md`)
1. **Regras entre funções:** invariantes que dependem de várias (ex.: aprovação de pagamento e transição do pedido na mesma transação).
2. **Quem alcança o quê:** papel/ator -> rota -> serviço -> tabela. Lacunas viram dúvida.
3. **Fronteiras de confiança:** onde entra dado externo (app, MP, lojista, admin) e onde é validado.
4. **Onde se concentra complexidade:** estado, concorrência, dinheiro, retentativa.
5. **Lista de prioridade para a caça:** (a) premissas `nada encontrado`; (b) dúvidas abertas; (c) registros que se contradizem (cite os dois, não concilie: a divergência é um fato sobre o código).

## 4. Pontos cegos típicos do Webag (verifique, não presuma)
Papel lido do token x do banco (DT-017); `store_members` e posse da loja; ID vindo do cliente; efeito colateral depois do commit (DT-004, evento pode se perder); webhook x re-consulta ao MP; fila em Postgres com `SKIP LOCKED` (DT-079); variável de ambiente que muda comportamento (ver `defaults-inseguros-e-armadilhas-de-api`); BFF do painel que guarda token em cookie.

## 5. Limites
Se o módulo é pequeno e você já o domina, não gaste tempo aqui. Dossiê desatualizado engana: registre commit e data no topo e refaça se o módulo mudou muito. Você não roda o sistema real nem lê produção; marque o que só dá para confirmar executando.

## Fontes e licença
- Trail of Bits, repositório `trailofbits/skills`, plugin `audit-context-building` (https://github.com/trailofbits/skills), licença **CC BY-SA 4.0** (https://creativecommons.org/licenses/by-sa/4.0/), consultado em 2026-11-22.
- Esta skill é **adaptação em português, reescrita com palavras próprias**, com mudanças: registro por função enxuto, pontos cegos do NestJS/Drizzle/BullMQ, lista de entradas do Webag e dossiê em `docs/seguranca/contexto/`. Sem scripts, agentes ou comandos do original. Por ser obra derivada, **é distribuída sob a mesma licença, CC BY-SA 4.0**.
