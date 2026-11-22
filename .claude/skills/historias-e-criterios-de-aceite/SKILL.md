---
name: historias-e-criterios-de-aceite
description: Escrita de histórias no padrão INVEST a partir de JTBD, critérios de aceite em Gherkin (feliz, limite, erro, vazio, permissão), divisão de histórias grandes e checagem de DoR. Use ao escrever ou revisar PRD/histórias WB-###, ao dividir um épico ou ao validar o aceite de uma entrega.
---
# Histórias e critérios de aceite (PO)

Complementa a skill `definicao-de-pronto` (checklist DoR/DoD) e o formato de PRD do `product-owner.md`. Regras de negócio ficam em `docs/produto/regras-de-negocio.md` (cite a regra, não a copie).

## 1. Do job à história
- **JTBD (descoberta):** "Quando <situação>, quero <motivação>, para <resultado>". Ex.: "Quando um pedido chega e estou no balcão, quero aceitá-lo em um toque, para não perder o cliente".
- **História (entrega):** "Como <persona>, quero <ação>, para <valor>" + ID `WB-###` + PRD de origem.
- **3 Cs:** Cartão (título e frase), Conversa (dúvidas resolvidas, registradas no PRD), Confirmação (critérios de aceite).

## 2. INVEST (reprove a história que falhar)
Independente (ordem livre), Negociável (diz o quê, não o como), com Valor para um usuário ou para o negócio, Estimável (devs conseguem), Pequena (cabe em um marco de 1 a 3 histórias, ver `plano-execucao.md`), Testável (todo critério pode passar ou falhar sem interpretação).

## 3. Gherkin do Webag
```
Funcionalidade: Pedido mínimo na sacola
  Cenário: abaixo do mínimo da loja
    Dado que a loja exige pedido mínimo de R$ 20,00
    E a sacola tem R$ 15,00 em produtos
    Quando o cliente toca em "Finalizar"
    Então vê "Faltam R$ 5,00 para o pedido mínimo"
    E o botão de pagamento fica desabilitado
```
Regras: um comportamento por cenário; Dado = estado, Quando = uma ação, Então = resultado observável; valores concretos (R$, minutos, metros, status); nada de implementação (tela, tabela, endpoint); linguagem de usuário.

## 4. Cenários obrigatórios por história
| Tipo | Exemplo Webag |
|---|---|
| Caminho feliz | PIX pago, pedido vai para "aceito" |
| Limite | pedido mínimo, raio de entrega, horário da loja, estoque 1 |
| Erro e recuperação | PIX expirado, sem internet, loja fechou durante o pagamento (o que o usuário vê e pode fazer) |
| Vazio | cidade sem lojas abertas, sacola vazia, sem pedidos |
| Permissão | lojista só vê pedidos da própria loja; cliente só os seus |
| Concorrência | duplo toque em "Pagar", dois lojistas aceitando, webhook repetido |
| Dados pessoais | consentimento, exclusão, o que aparece para a loja (LGPD) |
| Não funcional | rede 3G lenta, acessibilidade, texto legível |

## 5. Dividir história grande
Fatie na vertical (entrega valor de ponta a ponta), nunca por camada ("API" e "tela" separadas). Padrões: por passo do fluxo; por regra de negócio (uma regra por história); por perfil (cliente, lojista, admin); caminho feliz primeiro e exceções depois; por variação de dados (um meio de pagamento por vez); spike curto quando a incerteza é técnica (devs, com limite de tempo). Se a divisão sozinha não deixa 1 a 3 dias de trabalho por história, ela ainda está grande.

## 6. Anti-padrões
Critério subjetivo ("rápido", "amigável"); número faltando; critério que descreve implementação; vários resultados num cenário; cenários duplicados; história sem persona ou sem valor; ambiguidade empurrada ao dev. Teste final: um dev e um QA, sem falar com você, chegariam ao mesmo comportamento?

## 7. Aceite (quando a entrega volta)
Passe cada cenário contra a evidência do QA. Resultado: **Aceita** ou **Recusada** com o cenário violado, o observado e o esperado. Divergência de regra de negócio é erro de especificação seu; corrija o PRD, não discuta com o dev.

## Fontes e licença
- product-on-purpose/pm-skills, skills `deliver-acceptance-criteria` e `deliver-edge-cases` (Apache-2.0, Copyright Jonathan Prisant), consultadas em 2026-11-22. Adaptado: regras Gherkin, ordem das categorias de cenário e catálogo de bordas, em português com exemplos do Webag.
- phuryn/pm-skills, skill `user-stories` (MIT, Copyright Pawel Huryn), consultada em 2026-11-22. Adaptado: 3 Cs e INVEST. Formato JTBD e padrões de divisão: conhecimento geral (inspirado em).
