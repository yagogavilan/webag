# Tela: Admin, despacho, rota e motoboys   (WB-380, 381, 382, 383, 388)

> Autor: product-designer. Data: 2026-11-22. Release R3 (rota e despacho). Protótipo: `docs/prototipo/v1-1-logistica-e-analises.html#/a/despacho?aba=fila|mapa|hist`. Mapa **simulado** (SVG de ruas, sem dependência externa). Na barra do protótipo: "Ir para" pula etapas, "Perfil admin" troca permissões, "Sinal do motoboy" provoca "sem sinal", "Mapa indisponível" mostra a falha de tiles.
> Reaproveita: moldura do admin e tabela responsiva de `v1-1-admin-lojas.md`; tags, notas e diálogo de motivo do `design-system.md`. Produto real usa MapLibre + Protomaps (DEC-102); o protótipo imita só a aparência.
> Limite honesto: protótipo escrito sem poder executá-lo. O CEO abre e me devolve o que quebrar.

## 0. Decisões de UX (o CEO valida)

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Botão é o caminho principal; arrastar é atalho só no computador.** Cada pedido tem "Atribuir a Carlos" e "Atribuir a Rafael"; arrastar o cartão para o motoboy faz o mesmo. Reordenar paradas é por **setas subir/descer**, nunca só arrastando | WCAG 2.5.7 (arrastar precisa de alternativa por toque); arrastar em mapa e lista no celular da operação erra muito |
| 2 | **Lista primeiro, mapa junto.** Desktop: fila à esquerda, mapa e motoboys à direita. Celular: abas Fila, Mapa, Histórico | PRD WB-380 C2/C3: o mapa não é obrigatório; sem tiles a lista funciona |
| 3 | **Seleção com regras visíveis antes do toque**: contador "3 selecionados · 4 de 4 volumes" e a razão de bloqueio escrita ("Só da mesma cidade", "Passa da capacidade de 4 volumes: tire 1 corrida") | Prevenção de erro (H5); botão "Gerar rota" fica `aria-disabled` e **ainda explica** ao ser tocado |
| 4 | **Rota proposta é editável e mostra a conta**: ordem, horário previsto por parada, km, minutos e a frase "Estimado em linha reta x 1,3 e 6 min por km, mais 3 min por parada. Não considera trânsito." | Honestidade do estimado (RN-D2); o operador desconfia menos de número com método |
| 5 | **Motivo da mudança de ordem em 4 chips** (Trânsito, Pedido urgente, Pedido do cliente, Outro), só aparece depois da 1ª mudança e bloqueia o envio até escolher | PRD C7 exige motivo auditado; 1 toque custa menos que texto livre |
| 6 | **Motoboy "Disponível" não tem pino no mapa.** O cartão diz "Disponível · sem localização (o app só usa o GPS na corrida)" | **Conflito no PRD:** WB-380 C1 pede "última posição" de todo motoboy, mas RN-D7 proíbe GPS fora da corrida. Segui a RN-D7 (privacidade e risco J8). Custo: a operação não vê quem está mais perto. Pergunta ao PO |
| 7 | **Alertas em faixa no topo, ordenados por gravidade**, com palavra ("Urgente" ou "Atenção"), ícone e ação, nunca só cor | Acessibilidade; um alerta de atraso que depende de vermelho some ao sol |
| 8 | **Reatribuir só antes da saída**; depois que parte do lote saiu, o diálogo manda ligar ao motoboy | Reatribuir paradas de um lote em andamento sem regra no PRD vira pedido perdido. Pergunta ao PO |
| 9 | **Sem posição no mapa** (endereço sem ponto confirmado) não entra no cálculo: tag "Sem posição no mapa" e a seleção explica | WB-380 C5 |

## 1. Layout (de cima para baixo)

1. **Faixa de alertas** (região `aria-live="polite"`). Tipos: pedido pronto há 10 min (Atenção) e 20 min (Urgente) sem motoboy; motoboy sem sinal há 3 min; sem OK da loja há 3 min (lembrete enviado) e 10 min (Urgente, "Ligue para a loja"); loja contestou a saída automática; **previsto depois do fim da faixa** (Atenção, "Esta corrida pode atrasar") e **a 10 min do limite** (Urgente, "O cliente poderá cancelar sem custo a partir de HH:MM", = fim da faixa + tolerância de 15 min, DEC-053). Sem alertas: "Sem alertas agora." `[HIPÓTESE: limiares de 10 min do limite; PO decide]`
2. **Abas**: Fila (contador) · Mapa (só no celular) · Histórico do dia.
3. **Coluna esquerda (Fila de coleta)**: linha por pedido com caixa de seleção, "#1042 Moda Morato para Jardim Rosa", cidade, volumes, "pronto há 6 min", **tag de prazo** ("Prazo 16:10 · faltam 38 min": azul > 30 min, âmbar até 30, vermelho até 10 ou passado, sempre com relógio e texto), botões de atribuir. Rodapé fixo: "3 selecionados · 4 de 4 volumes", mensagem de erro, **Gerar rota com 3 pedidos**. Abaixo, seção **Em rota** com o estado de cada pedido e "Reatribuir rota".
4. **Rota proposta** (substitui a fila): escolha do motoboy (Carlos "Em turno · a 1,9 km da 1ª loja"; Rafael "Disponível · sem localização"), 3 números (paradas, km, minutos), lista numerada de paradas (coleta com quadrado roxo, entrega com círculo noite) com "chega 15:52 · 1,6 km", tag de atraso com **"Tirar do lote"**, links **Waze** e **Google Maps** por parada, setas subir/descer, motivo da mudança, e três botões: **Enviar rota ao Carlos** (principal), **Abrir a rota no Google Maps** (todas as paradas), **Enviar por WhatsApp (contingência)**.
5. **Coluna direita**: mapa (lojas com quadrado roxo e nome, pedidos com círculo e número, rota em roxo com contorno branco, motoboy em círculo noite com seta e etiqueta "Carlos · há 12 s", atribuição "© OpenStreetMap" sempre visível), cartões de motoboys com **Convidar motoboy**, e `<details>` "Ver posições em texto".
6. **Histórico do dia**: tabela Hora, Evento, Quem, **Fonte** (app, loja, sistema, admin; tag com texto) com filtro "Tudo" ou "Pedido #1042". Vira cartões no celular.

## 2. Interações

| Ação | Resultado |
|---|---|
| Marcar caixa de pedido ou tocar o pino no mapa | Alterna seleção (pino e linha ficam em sincronia) |
| "Atribuir a Carlos" em 1 pedido, ou arrastar | Abre a **rota simples** do pedido (coleta e entrega, WB-381 C9) com Carlos escolhido |
| "Gerar rota" | Calcula a ordem (exata até 8 paradas: o protótipo enumera as permutações com a coleta antes da entrega) e abre a rota proposta |
| Subir/descer | Recalcula horários e avisos; se a coleta passaria depois da entrega, toast "A coleta precisa vir antes da entrega do mesmo pedido." |
| "Tirar do lote" | Remove o pedido e recalcula |
| "Enviar rota ao Carlos" | Rota vai para AGUARDANDO_MOTOBOY; toast "Rota enviada ao Carlos. Ele tem 3 min para aceitar."; cartão do motoboy mostra a contagem. Sem motivo (se mudou a ordem): erro "Escolha o motivo da mudança de ordem." |
| Sem resposta em 3 min | A rota volta à fila e o histórico registra (RN-D5) |
| "Reatribuir" | Diálogo com motivo (Motoboy sem sinal, Motoboy recusou, Pedido urgente, Outro) e destino (Voltar para a fila ou outro motoboy) |
| "Convidar motoboy" | Nome e WhatsApp; link de uso único, 48 h; aviso de que não pedimos CPF (WB-383 C1, C6) |

## 3. Estados

| Estado | Texto e comportamento |
|---|---|
| Carregando | Skeleton de 6 linhas de 72 px (`aria-label` "Carregando…") |
| Vazio (fila) | "Nenhum pedido pronto agora. Quando uma loja marcar “Pronto para coleta”, o pedido aparece aqui." |
| Erro | "Não conseguimos carregar agora. Seus dados estão salvos. Tente de novo em instantes." [Tentar de novo] |
| Sem rede | Faixa "Sem conexão. Mostrando o que já carregou." |
| **Mapa indisponível** (tiles) | Cartão "Mapa indisponível. A lista segue funcionando. Tentamos de novo em instantes." [Tentar de novo] (WB-380 C3) |
| Motoboy sem sinal | Etiqueta "Carlos sem sinal" no mapa e tag vermelha com ícone no cartão; alerta aos 3 min |
| Sem posição do destino | Tag "Sem posição no mapa"; seleção bloqueada com "O pedido #1046 está sem posição no mapa. Confirme o endereço antes de gerar a rota." |
| Permissão | Perfil **Operação e Super admin** atribuem; **Suporte** vê mapa e lista **sem botões** e sem histórico de pontos (WB-388 C4); Financeiro só lê |
| Sucesso | Toasts de envio, reatribuição e convite |

## 4. Microcopy de erro (código estável do contrato, mensagem no app)

| Situação | Mensagem | Ação |
|---|---|---|
| Cidades diferentes | "Só da mesma cidade. Escolha pedidos de Francisco Morato ou de Franco da Rocha." | Ajustar seleção |
| Capacidade | "Passa da capacidade de 4 volumes: tire 1 corrida." | idem |
| Mais de 4 pedidos | "No máximo 4 pedidos por rota." | idem |
| Aceite expirado | "Sem resposta em 3 min: a rota voltou para a fila." | Atribuir de novo |
| Motoboy desativado ou revogado | "Este motoboy não recebe corridas." | Escolher outro |
| Qualquer `code` desconhecido | "Algo deu errado do nosso lado. Tente de novo em instantes." | Tentar de novo |

## 5. Acessibilidade

Ordem de leitura: alertas, abas, fila, rota, mapa, motoboys. Cada pino do mapa é `button` (44 x 44) com rótulo "Pedido 1042, selecionar"; o mapa é `role="img"` com resumo em texto e há **equivalente em texto** das posições. Alvos >= 44 px (setas, chips, caixas). Setas de reordenar têm rótulo "Subir a parada 2". Prazo e atraso: ícone + palavra + cor. Contraste: tags do `design-system` (todas >= 4,5:1); pino noite sobre mapa claro > 12:1. Foco visível lima sobre fundo escuro e roxo sobre claro. Teclado: tudo alcançável; o arrastar não tem exclusividade. Movimento: marcador desliza entre pontos em até ~1 s; **com redução de movimento o marcador salta a cada ponto** e nada anima.

## 6. Eventos

`route_generated` (stops, total_km, late_warnings), `route_sent` (channel), `route_reordered` (motivo), `route_reassigned` (motivo), `courier_invited`, `dispatch_alert_shown` (tipo). Sem nome e sem endereço.

## 7. Mapa WB para a tela

| História | Onde |
|---|---|
| WB-380 C1 a C5 | §1.5 e §3 (C1 parcial: motoboy sem corrida sem pino, ver decisão 6) |
| WB-381 C1 a C9 | §1.4 e §2 (C4, C5 em §4; C6 setas; C7 motivo; C8 sem chamada externa, é do dev) |
| WB-382 C1 a C5 | §1.4 (links por parada, botão de WhatsApp; push é do app, ver `v1-1-app-motoboy.md`) |
| WB-383 C1, C3 a C6 | §2 (convidar) e `v1-1-app-motoboy.md` (C2, aceite) |
| WB-388 C1 a C4 | §1.1, §1.6, §3 (suporte), §2 (reatribuir) |

## 8. Revisão heurística

**Nota 4 de 5.** DE-1 (sev. 3, H1): sem posição do motoboy disponível, a operação decide "no escuro"; mitigação: mostrar a **última cidade/bairro informado pelo motoboy** ao iniciar o turno (pergunta ao PO) ou aceitar o custo. DE-2 (sev. 2, H8): a rota proposta tem 3 botões de saída; manter só o principal visível e os outros em "Mais" se o teste mostrar hesitação. DE-3 (sev. 2, H7): falta "dividir a seleção entre Carlos e Rafael" (o pedido do fundador diz "1 ou 2 motoboys"; o PRD só tem lote para 1 motoboy). Bom: razão de bloqueio escrita antes de errar, setas como alternativa ao arrastar, alertas com palavra e ação. **Teste:** operador monta e envia um lote de 3 em <= 90 s (meta do PRD) com o cronômetro.

## 9. Perguntas

| Para | Pergunta |
|---|---|
| PO | 1. Motoboy disponível sem posição (RN-D7) x WB-380 C1: aceita? 2. "Atribuir a 1 ou 2 motoboys" é dividir um lote entre os dois? Hoje o lote vai a 1 motoboy. 3. Reatribuir lote parcialmente saído: regra? 4. Limiar "a 10 min do limite" para o alerta vermelho 5. Quem sem posição de destino: o admin pode corrigir o endereço na tela? |
| mobile-dev / tech-lead | 6. Limite de paradas e comportamento do link do Google Maps no iOS e Android (L6) 7. MapLibre com pinos HTML sobrepostos ou camada de símbolos (acessibilidade dos pinos) |
| Security | 8. Visibilidade da posição ao perfil Suporte (só corrida ativa) está coerente com a RN-D7? |
