---
name: descoberta-continua
description: Descoberta contínua do PO: um resultado desejado, árvore de oportunidades e soluções, mapa de premissas, experimentos baratos e roteiro de entrevista com lojista/consumidor (aplicada pelo fundador). Use ao validar hipótese, preparar o piloto, decidir o que investigar antes de uma feature ou montar entrevistas.
---
# Descoberta contínua (PO)

Princípio: antes de gastar construção, descubra o que é verdade. Você não fala com usuários; prepara o fundador para isso e registra o aprendizado. Dados em `docs/produto/pesquisa-mercado.md` §8 (HIP-###); personas em `docs/produto/personas.md`.

## 1. Árvore de oportunidades e soluções (docs/produto/descoberta.md)
1. **Um resultado por vez**, mensurável (ex.: "lojas com 1 ou mais pedido por semana na 4ª semana").
2. **Oportunidades (3 a 7):** necessidades/dores do usuário escritas como problema, nunca como recurso ("perco pedido no WhatsApp", não "quero chat"). Agrupe parecidas.
3. **Ranqueie** por Pontuação de Oportunidade = Importância x (1 − Satisfação), ambas de 0 a 1, a partir de entrevistas. Foque nas 2 ou 3 melhores.
4. **Soluções:** no mínimo 3 por oportunidade (inclui a versão sem software, ex.: atendimento manual). Nunca uma só.
5. **Experimentos** para as premissas mais arriscadas. Atualize a árvore toda semana; mate ramos que falharam.

## 2. Mapa de premissas
Liste o que precisa ser verdade para a solução funcionar, por tipo de risco: **Valor** (alguém quer?), **Usabilidade** (consegue usar?), **Viabilidade** (fecha a conta, é legal, dá suporte?), **Factibilidade** (dá para construir/operar?) e **Go-to-market** (dá para alcançar?). Para cada uma: importância (alta/baixa) x evidência (muita/pouca). Teste primeiro: alta importância e pouca evidência.
```
HIP-### | crença | tipo | evidência atual (fonte/data ou nenhuma) | teste | sucesso se | mata se | dono | data
```

## 3. Experimento mais barato que responde
| Para provar | Teste | Custo |
|---|---|---|
| Lojista quer vender no canal | Entrevista + pedir o cadastro ali na hora | Horas do fundador |
| Cliente compra por app local | Landing com lista de espera, ou catálogo no WhatsApp | Baixo |
| Operação aguenta | "Concierge": fundador/despachante opera na mão 5 lojas | Médio |
| Preço/comissão aceitável | Pergunta de disposição a pagar + proposta real | Baixo |
Defina antes o limite de sucesso e de morte. Resultado sem limite prévio não conta.

## 4. Entrevista (roteiro para o fundador aplicar)
- 20 a 30 min. Abertura: "estou aprendendo, não vendendo", pedir permissão para anotar (LGPD: consentimento, sem gravar dado pessoal desnecessário).
- Aquecimento (5 min): rotina, tamanho da loja, como vende hoje.
- Núcleo (15 min), sempre **comportamento passado**: "Me conta o último pedido que você perdeu/atrasou", "O que você fez?", "Quanto custou?", "O que já tentou?", "O que faria você trocar?".
- Fechamento: "O que eu não perguntei?" e "Quem mais devo ouvir?".
- Regras: pergunte da vida dele, não da sua ideia; ouça 80%; não faça pitch; elogio ("legal!") vale zero; emoção forte, dinheiro ou tempo já gasto são sinais reais.
- Ficha por conversa: ID, data, segmento, como vende hoje, maior dor, solução atual, quanto gasta, disposição a pagar, surpresa, próximo passo.
Mínimo de 5 a 10 conversas por segmento antes de concluir `[HIPÓTESE]`; pare quando as respostas se repetirem.

## 5. Anti-viés
Amigo/parente elogia; só quem já usa responde; pergunta que sugere a resposta; ouvir apenas o que confirma; generalizar 3 conversas. Registre também o que contradiz a hipótese.

## 6. Saída da descoberta
Atualize HIP-### (confirmada, refutada, inconclusiva), a árvore e `pesquisa-mercado.md`. Decisão resultante vai ao CEO com recomendação: seguir, ajustar ou parar, e o custo de oportunidade.

## Fontes e licença
- phuryn/pm-skills, skills `opportunity-solution-tree`, `identify-assumptions-new` e `interview-script` (MIT, Copyright Pawel Huryn), consultadas em 2026-11-22. Adaptado: estrutura da árvore, tipos de risco, roteiro por comportamento passado e ficha de conversa, em contexto de lojista local.
- Inspirado em Teresa Torres, *Continuous Discovery Habits* (método, sem texto copiado), e The Mom Test (Rob Fitzpatrick).
