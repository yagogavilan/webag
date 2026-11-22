# Autocrítica das apresentações v2.1 (após a avaliação da estrategista)

Autor: product-designer | Data: 2026-11-22 | Critério: rubrica `avaliar-post` (gancho 25%, ideia 15%, identificação 15%, prova 15%, miniatura 10%, CTA 10%, autenticidade 10%). Parecer de origem: `avaliacoes/2026-11-22-apresentacao-lojista.md` (Parte 1 = 3,9) e `...-cliente.md` (3,4).
**Limite que não some:** não renderizei (sem Bash) e a v2 foi reprovada justamente porque as minhas notas eram otimistas. As notas abaixo são **estimativas minhas, sem render e sem público**: a estrategista refaz. Onde o ponto é frágil, está dito. Pendências e riscos de quebra de linha: `pendencias.md` V2.4.

## O que mudou (por pedido do parecer)

| Parecer | Aplicado |
|---|---|
| Lojista: a conversa "Só retirando, tá?" é o melhor slide e estava enterrada | Agora é o **slide 1** (gancho); "Venda além da sua rua." virou o slide 2 (capa com tese) |
| Lojista: cartão do pedido com "WB-DM002", "Pago no app", seed; Parte 2 com Bolo/Pão/Suco, R$ 59,90 de seed | Cartões **desenhados** em HTML/CSS na marca, rótulo "Exemplo", loja de moda e casa, valores redondos (s4, s11, s13, s14). Sem código, sem horário, sem pagamento, sem comida. Cartão do s4 ocupa 890x640 de 1920x1080 |
| Lojista: "Sem mensalidade" e "Troca? Organizada no painel" sem confirmação | Atrás de `flags` em `config.json` (padrão `false`); troca sai e entra "Como vejo o que ganhei? Extrato no painel." (existe no painel) |
| Lojista: "Retire na loja." lê como ordem | "O cliente retira na loja." |
| Lojista s7: contato vazio, sem pessoa, ação dupla | Uma ação (com WhatsApp: "Mande “quero entrar” no WhatsApp."; sem: "Escreva ao lado. O Yago chama você."), "Fale com o Yago. Estou montando o Webag.", linhas à mão mantidas, e-mail só se preenchido. A coluna estava com texto branco sobre o cartão branco (sobreposição); agora é em fluxo |
| Cliente: abrir pela dor e virar | Slide 1 "Aquela loja que você adora. Não entrega." (uniformiza "adora"); slide 2 "Agora ela entrega." (a capa antiga e a virada eram redundantes e foram fundidas) |
| Cliente: s4 e s5 com farmácia de seed, 3,8 estrelas, "Veja no app" cobrindo horário | Cartão da loja ("Sua loja favorita", moda e casa, taxa R$ 8,00, 3 produtos) e linha do tempo desenhados; sem nota, sem avaliações, sem previsão, sem remendo |
| Cliente: s6 "Compre com tranquilidade" e menções a cartão/troca | Cortado, junto com os dois cartões "Em breve" das lojas de aplicativos. Nenhuma palavra sobre pagamento no cliente |
| Cliente: CTA com contatos vazios e duas ações | Uma ação: "Siga @webag no Instagram."; "Tem uma loja? Fale com o Yago." virou rodapé; WhatsApp à mão se vazio; site e e-mail só se preenchidos |
| Texto abaixo de 32 px | Zerado: notas legais de 24 px subiram para 32; a nota do exemplo de venda foi encurtada para caber em 2 linhas |

## Lojista, Parte 1 "A conversa" (estimativa por slide, 1 a 5)

| # | O que o dono sente em 3 s | Nota | Ponto frágil |
|---|---|---|---|
| 1 WhatsApp "Tem no 38? / Só retirando, tá?" | "Eu falo isso todo dia." Gancho de 1 s, na voz dele, com a dor em venda perdida | 5 | Nenhum visual de produto, e não precisa |
| 2 "Venda além da sua rua." (capa com tese) | A resposta à pergunta do slide 1; alcance | 4 | Fachada vetorial é genérica; com foto da rua do dono (IF6) vira 5 |
| 3 "Você separa. O Webag leva." | Alívio; é a oferta | 4 | Frase depende do parecer J8 (V14): bloqueia impressão |
| 4 "Chegou pedido." | "É isso que vai aparecer, e é um toque." Cartão escuro grande, texto de 38 a 68 px, "Aceitar pedido" em lima | 4 | É réplica desenhada e rotulada "Exemplo", não captura real: a "prova do produto" fica em 3 na rubrica até existir captura 2x neutra |
| 5 "Vendeu R$ 100? cerca de R$ 80" | Entendeu a conta sem calculadora | 4 | 15% e 4,98% seguem `[HIPÓTESE]` (nota de 32 px); sem a tag "Sem mensalidade" o slide fica mais vazio embaixo, mas honesto |
| 6 Quatro dúvidas | "Minhas desculpas estão respondidas." Respostas confirmadas | 4 | O 4º quadrante é "Extrato no painel", menos forte que "Troca?"; o dono pode perguntar de troca (anotar na visita) |
| 7 "Seu nome na lista de abertura." | Uma ação e uma pessoa ("Estou montando o Webag.") | 4 | **Condicional**: com WhatsApp do Yago vazio o slide ainda funciona na porta (escrever ao lado), mas por WhatsApp/PDF enviado seria 3. Preencher V9 |

Deck, Parte 1 (estimativa): gancho 5 · ideia 4 · identificação 5 · prova 3 · miniatura 4 · CTA 4 · autenticidade 4 = **4,25**. Sem trava: sem pagamento como argumento, sem prazo/superlativo novo, sem emoji/degradê, sem seed nem horário, J8 registrado em V5 e V14. O que o derruba: prova 3 (réplica) e s7 sem contato.

## Lojista, divisor e Parte 2 (consulta; fora da nota)

| # | Estado |
|---|---|
| 8 Divisor, 9 Cadastrar, 10 Aprovação | Sem mudança. O s9 mantém a captura do cadastro (sem seed) |
| 11 Produtos | Cartão desenhado com camiseta, vaso, calça; chips "Vendendo"/"Pausado" (texto, não só cor); anel no "Pausado" |
| 12 "10 minutos" | Sem mudança; número `[HIPÓTESE]` (V4) |
| 13 "Pronto? Marque." | Cartão "Em separação, 2 itens · R$ 188,00" com botão "Pronto para coleta"; "O motoboy do Webag busca" segue em V5 |
| 14 Financeiro | Cartão "exemplo" coerente com o s5; fecha com "Mande “quero entrar” no WhatsApp:" e o número (ou linha à mão) |

## Cliente (5 slides, estimativa)

| # | O que o cliente sente em 3 s | Nota | Ponto frágil |
|---|---|---|---|
| 1 "Aquela loja que você adora. Não entrega." | "É verdade." Dor em duas palavras gigantes | 5 | Fachada vetorial genérica |
| 2 "Agora ela entrega." | Resposta limpa, tag "Em breve" | 4 | J8 (V14) |
| 3 "Ela está no app." | "A loja, o preço e a taxa, claros." Sem seed | 4 | Réplica desenhada ("Exemplo"); "Taxa de entrega R$ 8,00" também depende de J8 |
| 4 "Acompanhe até a sua porta." | Linha do tempo com etapa atual em destaque e "Falar com a loja"; sem horário | 4 | Réplica; "Saiu para entrega" depende de J8 |
| 5 "Saiba quando abre." | Uma ação: seguir | 3 a 4 | Handle `@webag` é provisório (IF1); sem contato validado, o CTA é o ponto mais fraco do deck |

Deck (estimativa): gancho 5 · ideia 5 · identificação 4 · prova 3 · miniatura 4 · CTA 3 · autenticidade 3 = **4,05**. Está na margem: se a estrategista pontuar CTA ou autenticidade um ponto abaixo, volta para 3,9. O que mais subiria a nota é fora do meu alcance: fotos reais (IF6), o usuário real do Instagram e capturas 2x neutras.

## Riscos que a revisão não resolve

1. Sem render: quebras de linha e alinhamento fino podem pedir uma rodada (`pendencias.md` V19).
2. Os cartões desenhados são réplicas fiéis ao layout, não prova de produto real; troca por captura 2x quando `src/capturas/` existir (não existia em 2026-11-22).
3. J8 (entrega pelo Webag) sustenta o slide 3 do lojista e os slides 2 a 4 do cliente; nada imprime nem sai antes do parecer e do G5.
4. Contatos: WhatsApp, usuário real do Instagram e e-mail vazios; sem eles os CTAs perdem metade da força.
