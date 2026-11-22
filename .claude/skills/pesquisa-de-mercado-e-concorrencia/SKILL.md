---
name: pesquisa-de-mercado-e-concorrencia
description: Método do PO para pesquisa de mercado local e concorrência: perguntas de decisão, hierarquia de fontes, TAM/SAM/SOM bottom-up com premissas e faixas, matriz de concorrentes diretos e indiretos (inclui WhatsApp da loja) e checklist anti-viés. Use ao atualizar docs/produto/pesquisa-mercado.md, dimensionar uma cidade ou comparar com concorrente.
---
# Pesquisa de mercado e concorrência (PO)

Arquivo-alvo: `docs/produto/pesquisa-mercado.md` (mantenha a numeração §1 a §10; acrescente, não reescreva). Regra do projeto: toda afirmação tem **fonte + data de consulta** ou é `[HIPÓTESE]` com plano de validação. Rede pode estar bloqueada (R-03): se não conseguiu abrir a fonte, escreva "não verificado" e registre em Lacunas.

## 1. Comece pela decisão
Escreva 1 a 3 perguntas que a pesquisa precisa responder e **quem decide com elas** (CEO, fundador). Ex.: "Francisco Morato comporta 30 lojas ativas?", "Que comissão o lojista aceita?". Pesquisa sem decisão vira relatório que ninguém usa.

## 2. Hierarquia de fontes
| Nível | Exemplos | Peso |
|---|---|---|
| Primário | entrevistas e observação de lojistas e clientes (o fundador aplica), dados do piloto, teste em loja | Alto |
| Oficial/público | IBGE, SEADE, prefeituras, Receita (CNAE/MEI), termos e tabelas dos concorrentes | Alto, cheque a data |
| Secundário | relatórios setoriais, imprensa, tabelas de comissão de plataformas | Médio |
| Terciário | blogs, opiniões, posts | Só como pista, rotule |
Dado nacional não vale para a cidade; dado com mais de 12 meses leva aviso de data. Duas fontes independentes antes de tratar como fato.

## 3. Tamanho do mercado (TAM/SAM/SOM)
Use **os dois caminhos** e reconcilie:
- **De cima para baixo:** população/domicílios da região x gasto com consumo atendido por entrega, filtrando o que é endereçável.
- **De baixo para cima (preferido no Webag):** nº de comércios elegíveis por cidade x GMV por loja/mês x take rate; ou domicílios x pedidos/mês x ticket.
- **SAM:** o que o app serve de fato (cidades de DEC-009, categorias abertas, raio de entrega).
- **SOM em 12 meses:** limitado pela capacidade de captar e ativar lojas (tempo do fundador) e de despachar, não pelo tamanho do mercado.
Cada número leva: premissa, confiança (alta/média/baixa), como validar e o efeito se errar. Apresente **faixa** (mínimo, base, máximo), não valor único. Se a base for só `[HIPÓTESE]`, diga em destaque.

## 4. Concorrência em 3 camadas
| Camada | Exemplos a mapear |
|---|---|
| Direta (apps de entrega/marketplaces) | iFood, Rappi e similares, marketplaces regionais. Verifique quem opera na região |
| Indireta (substitutos) | **WhatsApp da loja**, Instagram, catálogo do WhatsApp Business, telefone, entregador do bairro |
| Não consumo | ir até a loja, esperar, comprar em marketplace de envio (Mercado Livre, Shopee) |
Matriz por concorrente: público, cobertura local, comissão, frete, meios de pagamento, prazo de repasse, suporte, ponto forte, ponto fraco, **evidência (URL, data)**. Fechamento: onde o Webag ganha (densidade local, comissão, confiança, suporte humano) e onde perde (marca, alcance, tecnologia). Se for útil, produza um battlecard de 1 página para a visita ao lojista (`go-to-market-e-lancamento`).
O que o lojista reclama das grandes: colete em entrevistas e em avaliações públicas (lojas de apps, sites de reclamação); marque a amostra e a data.

## 5. Anti-viés (passe antes de entregar)
- [ ] Busquei evidência que contradiz a tese (e a registrei)?
- [ ] Falei com quem não é meu fã (lojista que recusou, cliente que não usa app)?
- [ ] Algum número depende de uma só fonte ou de dado nacional/antigo?
- [ ] Separei fato, estimativa e opinião (`[HIPÓTESE]`)?
- [ ] O tamanho de mercado não foi empurrado para "dar certo"?
- [ ] Vi só quem sobreviveu (apps que ficaram), e os que fecharam?
- [ ] Há lacunas listadas, com quem pode preencher?

## 6. Saída
Atualize as seções do arquivo, liste **lacunas** e **próximas validações** (entrevista, piloto) e envie ao CEO: 5 linhas, o que mudou na recomendação e o que depende de decisão. Revisão antes de cada decisão grande (nova cidade, mudança de comissão) e no mínimo a cada trimestre.

## Fontes e licença
- phuryn/pm-skills, skills `market-sizing` e `competitor-analysis` (MIT, Copyright Pawel Huryn), consultadas em 2026-11-22. Adaptado: TAM/SAM/SOM por dois caminhos com premissas, estrutura da matriz competitiva, mapeamento de lacunas, em contexto de comércio local.
- Checklist anti-viés, hierarquia de fontes e camadas de concorrência: conhecimento geral de pesquisa (inspirado em).
