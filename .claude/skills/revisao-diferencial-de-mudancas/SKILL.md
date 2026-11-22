---
name: revisao-diferencial-de-mudancas
description: Revisão de segurança focada no que mudou (PR, commits, onda), com triagem de risco, regressão de controles removidos, raio de impacto e cenário de ataque. Use ao revisar um diff antes do G4, após correção de um achado SEC-### ou quando uma refatoração tocar auth, pagamento, dados pessoais ou permissões.
---

# Revisão diferencial de segurança

Pergunta central: **a mudança enfraquece algum controle que existia ou abre algo novo?** O risco manda na profundidade, não o tamanho do diff. Refatoração é suspeita até provar o contrário.

## 1. Delimite
`git log` e `git diff <base>...HEAD` (somente leitura). Liste arquivos e commits. Se a mudança tem contexto (ADR, PRD, SEC-### que ela corrige), leia antes. Módulo desconhecido e de alto risco: faça antes a skill `auditoria-com-contexto`.

## 2. Triagem por risco
| Risco | Toca em | Profundidade |
|---|---|---|
| **Alto** | auth/sessão/OTP/TOTP, autorização por recurso, pagamento/webhook/estorno/ledger, validação removida ou afrouxada, upload, segredo/config, chamada externa nova, query SQL | Leia tudo, dependências de 1 salto, cenário de ataque |
| **Médio** | regra de negócio, estado do pedido, API pública nova, DTO | Leia o diff e os chamadores |
| **Baixo** | texto, estilo, teste, log sem dado | Passada rápida |
Mais de 200 arquivos: reduza ao caminho crítico e **diga** o que ficou de fora.

## 3. Regressão: o que foi tirado importa mais que o que foi posto
- Para cada linha removida de verificação (`guard`, `if` de dono, validação, rate limit, assinatura, `@Roles`, `WHERE owner`): `git log -S` / `git blame` no trecho antigo. **Por que existia?** Era correção de SEC-### ou BUG? Foi recolocada em outro lugar? (`Grep`.)
- A mudança reintroduz achado já corrigido? Compare com `docs/seguranca/revisao-*.md` e os SEC fechados.
- **Escalar na hora:** commit de "fix de segurança" que remove código; controle de acesso removido ou estreitado; validação removida sem substituto; chamada externa sem timeout/validação; `console.log`/log com token ou payload de pagamento; default novo permissivo (ver `defaults-inseguros-e-armadilhas-de-api`).

## 4. Cobertura de teste e raio de impacto
- Código de risco alterado **sem teste novo** que prove o controle sobe a severidade em um nível. Existe teste para o caminho negativo (403, 404, assinatura inválida, repetido)?
- **Raio:** conte os chamadores (`Grep`, incluindo `apps/web/src/server`, worker, gateway). Função de autorização usada por 30 rotas com mudança de semântica é Alta mesmo com diff de 3 linhas.

## 5. Raciocínio de atacante (só para risco Alto)
Quem? (cliente fraudador, lojista mal-intencionado, concorrente, admin comprometido, bot). Que entrada controla? Qual o caminho até o ativo (dinheiro, dado, conta)? Qual o pré-requisito e a exploração mais barata? Escreva o cenário em 3 a 5 linhas com `arquivo:linha`. Sem cenário concreto, é "suspeita", não achado.

## 6. Relatório (`docs/seguranca/revisoes/AAAA-MM-DD-<slug>.md`)
Escopo (commits, arquivos analisados e **não analisados**), achados no formato `SEC-###` do agente (maior número + 1), regressões verificadas, cobertura de teste, raio calculado, veredito para o G4 e limites (o que revisão de código não prova). Checklist antes de fechar: todos os arquivos de risco lidos; `blame` feito nas remoções; raio contado, não estimado; cada achado com linha e cenário.

## 7. Quando não usar
Código novo sem histórico (use `checklist-seguranca` e threat model), mudança só de documentação, formatação ou lint.

## Fontes e licença
- Trail of Bits, repositório `trailofbits/skills`, plugin `differential-review` (https://github.com/trailofbits/skills), licença **CC BY-SA 4.0** (https://creativecommons.org/licenses/by-sa/4.0/), consultado em 2026-11-22.
- Adaptação em português, reescrita com palavras próprias: triagem de risco, foco em regressão, raio de impacto e escalonamento imediato foram mantidos como conceito; formato de relatório, tabela de risco, caminhos e IDs do Webag são novos. Sem scripts, subagentes ou comandos do original. Obra derivada, **distribuída sob CC BY-SA 4.0**.
