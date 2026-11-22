---
name: limites-de-modulo-e-acoplamento
description: Como verificar e proteger as fronteiras do monólito modular do Webag (ADR-007): API pública por módulo, contratos entre módulos, eventos, camada anticorrupção para o Mercado Pago e sinais de acoplamento. Use ao revisar um diff que cruza módulos, ao criar módulo novo ou ao decidir onde uma regra deve morar.
---

# Limites de módulo e acoplamento

Régua: ADR-007 (`docs/arquitetura/adr/ADR-007-modulos-api.md`). Um módulo é uma caixa: de fora só se vê `index.ts`; por dentro ele manda nas suas tabelas.

## 1. Teste de fronteira em 5 perguntas (rode no diff)
| Pergunta | Como checar | Se falhar |
|---|---|---|
| Algum import entra em `modules/<outro>/` fora de `index.ts`? | `Grep` por `modules/` nos imports do módulo alterado | Bloqueante: expor serviço no `index.ts` ou usar evento |
| Repositório ou tabela Drizzle de outro módulo é usada? | `Grep` pelo nome da tabela fora do módulo dono | Bloqueante (FK pode; acesso não) |
| Tipo do Drizzle (`InferSelectModel`) vaza no `index.ts` ou no DTO? | Ler `index.ts` | Troque por tipo de domínio/DTO do próprio módulo |
| Regra de negócio está no controller ou no front? | Ler controller; preço/frete/desconto no app | Mover ao service; o servidor é a fonte (cobrança calculada no servidor) |
| Surgiu ciclo `A -> B -> A`? | Siga os imports de 2 saltos | Quebre com evento ou inversão de dependência |

## 2. Contrato entre módulos
- **Chamada síncrona** (precisa do resultado na mesma transação): método de serviço exportado no `index.ts`, com entrada/saída tipadas e pequenas. O chamado herda `@Transactional()`.
- **Evento de domínio** (efeito colateral: push, e-mail, socket, imagem): emitido depois do commit, payload **mínimo, estável e versionado** (ids e fatos, não entidade inteira). Consumidor idempotente. Perda possível até existir outbox (DT-004): o estado sempre se recupera por REST.
- **Leitura entre módulos** (ex.: `search` precisa de loja e produto): serviço de consulta do dono ou projeção própria; nunca `JOIN` em tabela alheia.
- Mudou a assinatura pública de um módulo? Trate como mudança de contrato: liste os chamadores e atualize no mesmo PR.

## 3. Camada anticorrupção (terceiros)
O que vem de fora (Mercado Pago, SMS, geocodificador, Expo Push) é traduzido **na borda**, no adaptador, para tipos do domínio:
- `payments` expõe `PaymentProvider` (`mercadopago`, `fake`); status e campos do MP não aparecem em `orders`, `finance` nem no app.
- Resposta externa é validada (Zod) e vem com timeout e tratamento de falha; nunca confiada como verdade (a verdade do pagamento é a re-consulta ao MP).
- Trocar de provedor deve mexer em **um** diretório. Se mexe em três módulos, a antiga fronteira vazou.

## 4. Sinais de acoplamento (abra DT ou ADR)
- Mudança pequena exige edição em 4+ módulos (shotgun surgery).
- `admin` ou `packages/shared` virando depósito de regra de negócio: `shared` é **contrato e tipos gerados**, não regra.
- Dois módulos escrevendo na mesma tabela; ou status do pedido alterado fora de `orders` (a máquina de estados é só dele).
- Teste de um módulo precisa subir meia aplicação; mock de 5 dependências.
- Eventos com o mesmo payload "gordo" que todos consomem: virou API pública sem contrato.

## 5. Onde mora cada regra (decisão rápida)
Calcula dinheiro, frete, comissão: `checkout`/`finance` no servidor. Transição de pedido: `orders`. Estoque: `catalog`. Regra de horário/raio: `stores`/`regions`. Formatação e máscara: só no cliente. Autorização por recurso: no service do dono do recurso.

## 6. Quando extrair um módulo para serviço
Só com sinal medido: carga própria (ex.: `search` no k6), deploy independente necessário ou 2+ devs back-end (gatilho do ADR-007). Antes disso, o ganho é só a fronteira, que já existe.

## Fontes e licença
- Base: ADR-007 do Webag e conhecimento geral de arquitetura (ocultação de informação, de D. Parnas; camada anticorrupção, de Eric Evans, DDD). Texto próprio.
- addyosmani/agent-skills, `code-review-and-quality` (MIT), consultada em 2026-11-22: apenas o eixo "arquitetura" do review. Não há skill pública equivalente adotada; esta é criação própria.
