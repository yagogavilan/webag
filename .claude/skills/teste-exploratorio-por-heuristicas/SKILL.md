---
name: teste-exploratorio-por-heuristicas
description: Sessões de teste exploratório com charter, tours e a heurística SFDIPOT adaptadas ao marketplace do Webag, incluindo ruídos de borda (virada de horário, raio, estoque, rede). Use ao liberar uma onda/história com regra complexa, antes do G4, ou quando os testes automáticos passam mas algo "cheira mal".
---

# Teste exploratório por heurísticas

Exploratório **não é** clicar aleatório: é aprender, desenhar e executar ao mesmo tempo, com missão, tempo e registro. Complementa os casos de `docs/qa/planos/`; busca o que o roteiro não previu.

## 1. Charter (uma missão por sessão de 45 a 90 min)
`Explorar <área> com <recurso/dado/perfil> para descobrir <risco ou informação>`.
Ex.: "Explorar o checkout com loja que fecha durante a montagem da sacola para descobrir se o pedido nasce inconsistente". Escolha o charter pelo **risco** (dinheiro, estoque, estado do pedido, autorização, troca), não pela tela.

## 2. SFDIPOT aplicado ao Webag
| Eixo | Perguntas | Exemplos |
|---|---|---|
| **S**tructure | O que compõe? | app, web, API, worker, filas, banco |
| **F**unction | O que faz, e o que não deveria? | cotar, pagar, aceitar, cancelar, estornar, trocar |
| **D**ata | Entradas e limites | centavos, nome com acento/emoji/muito longo, telefone com +55 e 9º dígito, CEP na borda do raio, estoque 0/1/N |
| **I**nterfaces | Quem fala com quem | app-API, MP e webhook, Socket.IO, push, e-mail |
| **P**latform | Onde roda | Android de entrada (2 GB), iOS antigo, tela pequena, web em celular, fonte grande |
| **O**perations | Uso real | cliente apressado, lojista com 3 pedidos ao mesmo tempo, admin corrigindo erro |
| **T**ime | Quando | 23:59 para 00:00, loja que abre/fecha no meio da compra, fuso, expiração de PIX/OTP/sessão, relógio do aparelho errado |

## 3. Tours (escolha 1 ou 2 por sessão)
- **Dinheiro:** siga cada centavo (preço, frete, cupom, comissão, estorno, extrato) e confira que fecha.
- **Sabotador:** interrompa no pior momento: app em segundo plano durante o PIX, rede cai ao confirmar, toque duplo em "Pagar", voltar no meio, duas abas/dois aparelhos na mesma conta.
- **Beco escuro:** estados raros (pedido cancelado após pago, troca de pedido já estornado, loja desativada com pedido aberto).
- **Mau vizinho:** acesse recurso de outro (ID alheio, loja de outro lojista); tente ação fora do papel (vira insumo para o `security-engineer`).
- **Sofá:** deixe parado (sessão expira, PIX vence, push chega com app fechado).
- **Cachinhos Dourados:** valor pequeno demais, grande demais, exato no limite (pedido mínimo, raio, estoque).
- **Auditor:** o que o admin enxerga bate com o que cliente e lojista viram? Há trilha de quem mudou o quê?

## 4. Ruídos de borda (lista para sempre incluir)
Virada 23:59-00:00 e fechamento da loja com carrinho aberto; relógio do servidor x aparelho; pedido a 1 m do limite do raio; dois clientes na última unidade; reenvio do mesmo webhook; usuário que perde permissão no meio da ação; textos longos quebrando layout; permissão negada (localização, notificação); modo avião ao abrir; bateria baixa/economia de dados; idioma e fonte do sistema alterados.

## 5. Condução e registro
1. Prepare dados com builders/seed; anote versão, commit e ambiente.
2. Explore em ciclos curtos: hipótese -> ação -> observação. Ao achar algo estranho, **repita para reproduzir** antes de registrar.
3. Registro em `docs/qa/relatorios/explor-AAAA-MM-DD-<slug>.md`: charter, tempo, o que foi coberto e **o que não foi**, bugs (`BUG-###`), dúvidas para o PO, riscos, novos casos para automatizar.
4. Bug achado: skill `relato-de-bug-e-causa-raiz`. Comportamento duvidoso sem critério de aceite vai ao PO como pergunta, não como bug.
5. Você não tem aparelho: tudo que depende de hardware vira roteiro curto para o fundador (passos, resultado esperado).

## Fontes e licença
- Conhecimento geral e metodologia pública: charters e Session-Based Test Management (Jonathan Bach/James Bach), SFDIPOT (heurística do Heuristic Test Strategy Model, James Bach), tours (James Whittaker), "Explore... with... to discover..." (Elisabeth Hendrickson). Nenhum texto copiado; exemplos, tabela e ruídos de borda são do autor, para o Webag.
- addyosmani/agent-skills, `agents/test-engineer.md` (MIT), consultada em 2026-11-22: só a lista de concorrência e ordem de respostas. Consulta de 2026-11-22.
