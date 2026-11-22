---
name: microcopy-e-ux-writing-ptbr
description: Guia de microcopy em português do Brasil para o Webag (botões, erros, vazios, confirmações, permissões, push, formatos de moeda e data, mapeamento de códigos de erro da API). Use ao escrever a microcopy final de uma spec de tela ou revisar texto de interface.
---

# Princípios
Claro, curto, consistente, útil, humano. Cada texto faz um trabalho. Escreva da perspectiva de quem usa, com o nome que ele conhece (não o do banco de dados).
- Tratamento: "você". Tom de vizinho educado: simples, sem gíria que envelhece, sem formalismo de banco.
- Caixa de sentença (só a primeira maiúscula) em títulos e botões; Title Case é convenção do inglês e não vale em pt-BR.
- Um termo por conceito, em toda a interface (sacola, pedido, loja). Manter glossário em `docs/design/glossario-ux.md`; termo novo entra lá antes de entrar na tela.

# Padrões
| Elemento | Regra | Exemplo |
|---|---|---|
| Botão | Verbo + objeto, diz o resultado | "Pagar com PIX", "Adicionar à sacola" (nunca "Continuar", "OK") |
| Erro | O que houve + o que fazer; sem culpar, sem "Ops!" | "Não conseguimos confirmar o pagamento. Confira sua conexão e tente de novo." |
| Vazio | Por que está vazio + próximo passo | "Você ainda não fez pedidos. Veja lojas abertas perto de você." |
| Confirmação destrutiva | Nomeia a ação e a consequência; botões com verbo | "Cancelar este pedido? O estorno leva até X dias." [Cancelar pedido] [Manter pedido] |
| Carregando | Diz o que acontece; termina em reticências | "Buscando lojas perto de você…" |
| Sucesso | Curto, confirma o fato | "Código PIX copiado" |
| Permissão (antes do diálogo do sistema) | Benefício concreto + "Agora não" | "Usamos sua localização só para mostrar lojas que entregam aí." |
| Push | O que mudou + quando, sem alarmismo | "Seu pedido saiu para entrega. Chega em cerca de 15 min." |

# Formatos pt-BR
- Moeda `R$ 19,90` via `Intl.NumberFormat('pt-BR')`; grátis escreve-se "Grátis". Tempo "30 a 40 min". Data "hoje, 18:30", "ter., 12 nov". Horário 24 h. Telefone `(11) 91234-5678`.
- Plural correto ("1 item", "2 itens"). Reticências com o caractere `…`. Unidade com espaço sem quebra ("500 g").

# Erros da API (contrato-api: `code` estável, o app decide a mensagem)
Mantenha uma tabela `code -> mensagem -> ação` na spec. Exemplos: `STORE_CLOSED` -> "A loja abre às 08:00. Sua sacola fica salva." -> [Ver horários]. Código desconhecido cai numa mensagem genérica honesta ("Algo deu errado do nosso lado. Tente de novo em instantes.") + [Tentar de novo]. Nunca exibir `code` ou stack ao usuário.

# Responsabilidade (revisão ética do texto)
Sem urgência falsa ("só hoje!" sem regra real), sem culpar, sem esconder taxa: frete, taxa de serviço e total aparecem antes do botão de pagar. Texto de cancelamento/troca reflete a regra do PRD (piso do CDC, DEC-011); em dúvida jurídica, encaminhar ao fundador/Security.

# Limites práticos [HIPÓTESE: validar em aparelho]
Botão até ~24 caracteres; título de card 2 linhas com truncamento; push até ~40 (título) e ~90 (corpo); mensagem de erro até 2 frases. Todo texto pode ficar 30% maior que o exemplo (fonte grande, textos longos): nada de largura fixa.

# Lojista e admin
Mesmo rigor, vocabulário do comércio ("Aceitar pedido", "Pausar produto", "Sem estoque"). Ação irreversível sempre com confirmação nomeada ou "Desfazer".

# Checklist de saída
- [ ] Todo botão tem verbo; todo erro diz a ação; todo vazio tem próximo passo
- [ ] Termos batem com o glossário; valores no formato BRL
- [ ] Cada `code` de erro da spec tem mensagem; texto cabe em fonte 200%

## Fontes e licença
- anthropics/knowledge-work-plugins, skill `ux-copy` (Apache-2.0, LICENSE conferido), consultada em 2026-11-22. Adaptado: princípios e padrões de CTA, erro, vazio e confirmação; traduzido para pt-BR com formatos, caixa de sentença, mapeamento de `code` e regras de responsabilidade.
- webiscorp/designskill-open, skill `design-critique` (MIT), 2026-11-22: lentes "usável, útil, responsável" para revisar texto.
