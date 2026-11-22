# Tela: Lojista, "Saiu com o motoboy" e avisos   (WB-390, WB-396 lojista, WB-397)

> Autor: product-designer. Data: 2026-11-22. Release R3. Protótipo: `v1-1-logistica-e-analises.html#/l/pedidos` (faixa de saída aparece em **qualquer** tela do lojista quando o motoboy chega), `#/l/avisos`. Para ver: barra "Ir para" > "Motoboy na loja".
> Reaproveita: moldura do lojista (`.hd`, `.sheet`, navegação inferior) do protótipo R1/R2.

## 0. Decisões de UX (o CEO valida)

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Faixa fixa no topo de toda tela do lojista** com a pergunta "O motoboy pegou o pedido?" e o botão grande **"Sim, saiu com o motoboy"** (72 px, lima sobre noite). Não é só um item de lista | O lojista está no balcão, mexendo em outra tela. O PRD aponta o esquecimento como ponto frágil. A faixa é visível com som desligado, ao sol e com a tela no meio de outra tarefa |
| 2 | **Som + vibração + faixa**, nunca só som | Acessibilidade e `design-system` (alerta do lojista) |
| 3 | **Um toque confirma todos os pedidos do mesmo motoboy na mesma loja.** Com 2 ou mais pedidos aparecem caixas marcadas ("#1042 Carla, 1 volume"); desmarca quem ainda não está pronto | O PRD descreve confirmação por pedido; 2 toques seguidos para o mesmo motoboy é fricção em hora de pico. A regra de negócio continua por pedido |
| 4 | **Lembrete aos 3 min: a faixa fica vermelha** e o texto passa a "O motoboy aguarda há 3 min" (som mais forte) | Escala de urgência com palavra e cor |
| 5 | Se o motoboy já marcou "Peguei", a faixa diz **"Carlos marcou que pegou às 15:41. Se você não confirmar, confirmamos sozinhos em 4:12"** | Transparência da regra automática (F12): o lojista sabe o que vai acontecer e quando |
| 6 | **"Ainda estou separando"** (secundário) só silencia o som por 2 min | Dá saída honesta sem criar estado novo no pedido `[proposta; PO confirma]` |
| 7 | **"Desfazer saída (1:48)"** na linha do pedido enquanto vale (2 min e motoboy a até 150 m); depois some e o texto vira "fale com a operação" | WB-390 C4. Mostrar o prazo evita o toque tardio e a frustração |
| 8 | **Saída automática vira aviso com saída fácil**: "Confirmamos a saída às 15:42 porque o motoboy já estava com o pedido. Não foi isso? [Não saiu: avisar a operação]" por 10 min | RN-R8 e C8 da WB-391. A contestação não pede explicação |
| 9 | Preferências: **o que não desliga aparece trancado** (cadeado, "Sempre ligado") | DEC-074a; esconder gera dúvida de "cadê o aviso" |

## 1. Layout

**Faixa de saída** (acima do conteúdo, `position: sticky`): ícone de caixa + "Carlos chegou para o pedido #1042" + "Chegou há 0 min. O motoboy pegou o pedido?" + (se vários) lista de caixas + linha da regra automática + botão principal + "Ainda estou separando".
**Pedidos** (`#/l/pedidos`): cartão por pedido: "#1042 Carla · 1 volume · Jardim Rosa" + tag do estado com horário ("Saiu para entrega às 15:42") + ação do momento: "Marcar como pronto" (aceito), "Desfazer saída (2:00)" (saiu), aviso de saída automática. Rodapé: "Você vê o primeiro nome do cliente só enquanto o pedido está ativo." (RN-14).
**Avisos e som** (`#/l/avisos`): lista "Sempre ligados" (Pedido novo; Motoboy chegou; Lembrete de saída; Saída automática) cada um com o canal em uma frase; cartão **Avisos no navegador ou no celular** (interruptor, estado "Desligado | Ligado neste aparelho | Bloqueado no navegador"); botão "Testar som e vibração".

## 2. Interações e estados

| Ação ou estado | Resultado |
|---|---|
| Toque em "Sim, saiu com o motoboy" | Pedido(s) marcados `loja`; faixa some; toast "Saída registrada às 15:42. O cliente foi avisado." com **Desfazer** (8 s); duplo toque registra uma vez (C3) |
| Nenhum pedido marcado (vários) | Toast "Marque ao menos um pedido." |
| Desfazer válido | Pedido volta a "motoboy na loja"; cliente recebe "O pedido ainda não saiu"; toast "Saída desfeita. O motoboy volta a esperar." |
| Desfazer vencido | Toast "Já passou o tempo de desfazer. Fale com a operação." |
| Funcionário sem permissão de pedidos | A faixa **não aparece** (C5); o aviso de som ainda toca com o texto "O motoboy chegou" sem botão `[proposta]` |
| Pedido de retirada | Não há faixa nem botão (C6) |
| Painel fechado | Web Push (se ligado) com o texto do §3; a regra de 5 min cobre o resto (C7) |
| Carregando, vazio, erro | Vazio: "Nenhum pedido agora. Quando um cliente comprar, o pedido aparece aqui com som e aviso." Erro e sem rede como nas demais telas do lojista |
| Web Push, 1ª vez | Só depois do toque no interruptor; diálogo "Ligar avisos no navegador?" com o que chega e o que não chega; botões "Agora não" e "Ligar avisos" (C3 da WB-397) |
| Web Push bloqueado | "Você bloqueou os avisos neste navegador. Libere nas configurações do site e volte aqui." |
| iPhone | Texto fixo: "No iPhone, os avisos só funcionam se o painel estiver adicionado à tela inicial." |

## 3. Textos de aviso (limite do PRD: título <= 60, corpo <= 120)

| Evento | Painel/Push |
|---|---|
| Motoboy chegou | "Carlos chegou para o pedido #1042." / "Entregue e toque em “Saiu com o motoboy”." |
| Lembrete (3 min) | "O motoboy aguarda o pedido #1042." |
| Saída automática | "Confirmamos a saída do pedido #1042 às 15:42 porque o motoboy já estava com ele. Não foi isso? Avise a operação." (e-mail de resumo, sem urgência) |
| Entregue | "Pedido #1042 entregue." |
Nenhum push leva dado do cliente (C1 da WB-397).

## 4. Acessibilidade

Faixa é `role="region"` com `aria-live="assertive"` **só quando aparece**; o foco não é roubado do campo em que o lojista está. Botão 72 px, texto 20 px. Contraste: lima sobre noite > 15:1; no modo lembrete, branco sobre vermelho `#B3261E` 6,5:1 (botão branco com texto noite). Contagem regressiva em texto, atualizada sem anunciar a cada segundo. Interruptores com `role="switch"` e rótulo; os trancados têm `aria-disabled` e a razão em texto. Redução de movimento: a faixa entra sem deslize.

## 5. Eventos

`pickup_arrived` (store_id, source), `pickup_confirmed` (source, wait_s), `pickup_confirmation_contested`, `pickup_undo`, `webpush_enabled`, `webpush_blocked`. Sem nome do cliente.

## 6. Mapa WB para a tela

| História | Onde |
|---|---|
| WB-390 C1 a C8 | §1 (faixa), §2 (C3 duplo toque, C4 desfazer, C5 permissão, C6 retirada, C7 painel fechado); **C8** (loja confirma sem o motoboy ter marcado "Cheguei") aparece na faixa só quando o motoboy chegar; sem chegada, o botão fica em "Pedidos" para o fallback `[pergunta 3]` |
| WB-396 C1, C4 | §3 e §1 (som em até 5 s, sem e-mail da chegada, e-mail de resumo da automática) |
| WB-397 C1 a C4 | §1 (Avisos e som), §2 |

## 7. Revisão heurística

**Nota 4 de 5.** LS-1 (sev. 3, H5): a faixa só existe quando o motoboy "chega"; se o motoboy esquece "Cheguei à loja" **e** o app registra a chegada pela posição (100 m), cobre; se não há GPS, a loja não vê faixa e a regra automática também não dispara (admin aos 10 min). Mitigação: botão "Saiu com o motoboy" também na linha do pedido (estado "motoboy a caminho") `[pergunta 3]`. LS-2 (sev. 2, H4): "Ainda estou separando" sem efeito no estado pode parecer inútil; testar. LS-3 (sev. 2, H2): "Saiu" é do lojista, mas o cliente lê "saiu para entrega"; manter. Bom: faixa visível em qualquer tela, regra automática explicada com contagem, desfazer com prazo, itens obrigatórios trancados. **Teste:** 3 lojistas na hora do pico: tempo entre a faixa e o toque; % que usa "Ainda estou separando".

## 8. Perguntas

| Para | Pergunta |
|---|---|
| PO | 1. Confirmar vários pedidos com 1 toque (decisão 3) 2. "Ainda estou separando" silencia o som: aceita? 3. Permitir "Saiu" também com o motoboy a caminho (sem chegada registrada) |
| Security | 4. Funcionário sem permissão: o aviso de chegada tem texto, sem botão? |
| mobile-dev | 5. Web Push no iPhone só com tela inicial: o painel é PWA instalável hoje? |
