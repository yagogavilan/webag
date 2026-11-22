---
name: analise-de-variantes
description: Depois de achar uma falha, caçar as irmãs: mesma causa raiz em outros módulos, camadas e formas, e propor regra que impeça a volta. Use sempre que um SEC-### ou BUG de segurança for confirmado, ao fechar um achado de IDOR, webhook, validação ou log, e antes de declarar um módulo "limpo".
---

# Análise de variantes

Uma falha raramente vem sozinha: o mesmo erro mental foi repetido em outras rotas, camadas ou por outra pessoa. Corrigir só a instância achada deixa as irmãs abertas.

## 1. Entenda a causa raiz (não o sintoma)
Escreva em 1 frase **por que** o código está errado, não o que ele faz. Ex.: "o serviço busca o pedido por ID e confia que a rota já checou o dono" (e não "o endpoint X vaza pedidos"). Liste onde a causa pode aparecer de outro jeito:
- mesma função/padrão com outro nome ou assinatura;
- outro tipo de recurso (pedido, endereço, loja, troca, documento, cupom);
- outra camada: controller, service, job BullMQ, gateway Socket.IO, BFF `apps/web/src/server`, CLI, mobile;
- caso de borda do dado: nulo, vazio, lista, ID de outro papel/loja.

## 2. Padrão exato primeiro
Escreva uma busca (`Grep`/regex) que case **somente a instância conhecida** e confirme que acerta. Se não acha nada, você entendeu errado o padrão: volte ao passo 1.

## 3. Generalize um elemento por vez
Escada de abstração: nome exato -> nome da família (`findById|findOne|get...ById`) -> forma (qualquer leitura por ID sem filtro de dono) -> semântica (qualquer caminho que chega ao dado sem checar posse). A cada degrau:
1. Mude **uma** coisa. 2. Rode. 3. **Leia todos os resultados.** 4. Pare quando mais da metade for ruído; volte um degrau e ataque por outro eixo.
Mudar vários elementos de uma vez impede saber de onde veio o ruído.

## 4. Eixos para varrer no Webag
| Falha original | Procure irmãs em |
|---|---|
| IDOR (falta checar dono) | toda leitura/escrita por ID: pedidos, endereços, trocas, documentos, mídia; rotas de lojista com `storeId` do corpo; subscrição de sala Socket.IO; URLs assinadas |
| Valor vindo do app (preço, frete, desconto, `role`) | DTOs de criação/atualização, cotação, cupom, estorno, `PATCH` de loja |
| Webhook sem assinatura/idempotência | outros receptores externos (OAuth do MP, e-mail, push, geocodificador) |
| Dado sensível em log/erro | `logger.*`, `console.*`, filtros de exceção, Sentry, auditoria |
| Sem rate limit/anti-automação | OTP, cadastro, cupom, recuperação, busca, reenvio de código |
| Validação Zod frouxa | DTOs com `passthrough`, `any`, `z.string()` sem limite |
| Autorização só na UI | ação presente no app/web mas sem checagem no servidor |

## 5. Triagem e relato
Para cada candidato: **real, falso positivo ou suspeita** (com o que verificar), severidade própria (a mesma causa pode ser Alta numa rota e Baixa em outra). Registre cada irmã como `SEC-###` ligado ao original ("variante de SEC-xxx") ou agrupe se a correção é única. Documente também as **buscas que não acharam nada** e os eixos não cobertos: o próximo revisor não repete e vê o limite da cobertura.

## 6. Feche o ciclo (evitar a volta)
Proponha ao dev/`tech-lead` **um mecanismo**, do mais forte ao mais fraco: tipo ou helper que torna o erro difícil (`getOwnedOrder(userId, id)` no lugar de `findById`); regra de ESLint/`no-restricted-syntax`; teste de contrato que percorre **todas** as rotas do `openapi.yaml` com papel errado esperando 401/403 (já há `contract.e2e-spec`); caso na lista de review. Anote o gatilho em `checklist-seguranca` se for recorrente.

## 7. Erros comuns
Procurar só no módulo do achado; padrão específico demais; perseguir uma classe só (olhar IDOR e esquecer mass assignment na mesma rota); testar só o caminho feliz; ignorar worker/BFF/mobile.

## Fontes e licença
- Trail of Bits, repositório `trailofbits/skills`, plugin `variant-analysis` (https://github.com/trailofbits/skills), licença **CC BY-SA 4.0** (https://creativecommons.org/licenses/by-sa/4.0/), consultado em 2026-11-22.
- Adaptação em português, reescrita com palavras próprias, mantendo o método (causa raiz, padrão exato, generalizar um elemento por vez, parar com >50% de ruído, regra de prevenção). Novos: tabela de eixos do Webag, mecanismos de prevenção e formato de relato. Sem regras CodeQL/Semgrep, comandos ou subagentes do original. Obra derivada, **distribuída sob CC BY-SA 4.0**.
