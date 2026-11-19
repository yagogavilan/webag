# Telas da Onda 4D: Logística no admin (DEC-036)

> Autor: product-designer. Data: 2026-11-19. Decisões: DEC-036 (logística é da Webag), DEC-037 (coleta de troca entra na mesma fila), DEC-024c e RN-13 (perfis). Base: `design-system.md` (v0.3.0), `identidade.md` §8, `onda-2` §0 (convenções web), `onda-5-posvenda.md` M1 a M3 (padrão do admin). `docs/produto/prd/logistica.md` **ainda não existe**: tudo que depende dele está marcado **[HIPÓTESE]** e listado na §Z. Quando o PRD sair, o PO e eu reconciliamos.
> **Fora da 1.0 (DEC-036e e DEC-028b):** mapa, rota, rastreio em tempo real do motoboy, app ou página do motoboy, pagamento ao motoboy pelo sistema. O admin atualiza os status e fala com o motoboy por WhatsApp.
> Plataforma: painel admin web, mobile-first (o fundador opera pelo celular). Prefixo de teste: `admin.logistica.` (`data-testid`, kebab-case). Estados padrão (EP): `onda-2` §0.2.

## 0. Convenções

**0.1 Princípio de desenho.** A pessoa que despacha tem 3 perguntas, nesta ordem: **quem está esperando há mais tempo? quem vai buscar? já foi buscado e entregue?** Cada tela responde uma. Uma ação principal por tela, no rodapé fixo no celular (alcance do polegar). Tudo funciona com **uma mão, sem hover, sem teclado e sem tabela**: em celular a fila é lista de linhas (DS DataTable < `md`).

**0.2 Modelo de estados do trabalho de logística** (o "trabalho" é uma entrega de pedido ou uma coleta de troca; hipótese de nomes, o backend confirma):

| Tipo | Estados (rótulo no admin) | Próximo passo (botão único) |
|---|---|---|
| **Entrega** | Pronto para coleta (sem motoboy) > Motoboy a caminho da loja > Coletado, a caminho do cliente > Entregue. Saída lateral: Não entregue | Atribuir motoboy > Marcar como coletado > Marcar como entregue |
| **Coleta de troca** (arrependimento, defeito com reembolso, troca sem peça nova na viagem) | A coletar > Motoboy a caminho do cliente > Peça coletada, a caminho da loja > Entregue na loja. Saída: Não coletado | Atribuir motoboy > Marcar como coletada > Marcar como entregue na loja |
| **Troca ida e volta** (a loja prepara a peça nova; 1 deslocamento, DEC-037) | Pronto para coleta (peça nova) > Motoboy a caminho da loja > Com a peça nova, a caminho do cliente > Troca feita, peça antiga a caminho da loja > Entregue na loja. Saída: Não entregue | Atribuir motoboy > Marcar como coletado > Marcar troca feita com o cliente > Marcar como entregue na loja |

Selos (StatusBadge, ícone + texto): Pronto para coleta (alerta, `Package`), A coletar (alerta, `ArrowsClockwise`), A caminho da loja/do cliente (info, `Motorcycle`), Coletado/Com a peça (info, `Truck`), Entregue (sucesso, `CheckCircle` Fill), Não entregue/Não coletado (erro, `XCircle`).

**0.3 O que o cliente vê** (não cria nó novo na linha do tempo de 5 passos do S7): Pronto para coleta e Motoboy a caminho da loja = passo "Em separação" com texto "Pronto. Estamos chamando o motoboy." / "O motoboy está a caminho da loja."; Coletado = "Saiu para entrega"; Entregue = "Entregue". O **prazo de troca ("Você tem até 25 nov") conta do "Entregue" marcado aqui** (ver §Z, risco 1).

**0.4 Tempo de espera (WaitChip, componente novo).** Mostra há quanto tempo o trabalho espera por quem o atende. Sempre **ícone + texto**, nunca só cor.

| Nível | Entrega (minutos desde "pronto para coleta") | Troca (dias úteis até o fim do prazo de coleta, HIP-019: 3) | Visual |
|---|---|---|---|
| Normal | até 9 min: "Esperando há 4 min" | 2 ou mais: "Coletar até 25 nov" | `surface.sunken`, `Clock` |
| Atenção | 10 a 19 min: "Esperando há 12 min" | 1: "Coletar até amanhã" | `warning.subtle`, `Warning` |
| Atrasado | 20 min ou mais: "Atrasado · 22 min" | Vence hoje ou venceu: "Coletar hoje" / "Atrasado 1 dia" | `danger.subtle`, `WarningCircle` |

Limites 10 e 20 min = `logistica_espera_atencao_min` e `logistica_espera_atrasado_min` **[HIPÓTESE, parâmetros do admin]**. Referência: o iFood relata ~4 min para alocar um entregador e ~7 min até ele chegar à loja (CEO do iFood no D2C Summit, via Central do Varejo [S, resumo de busca; não abri a página]); numa operação manual pequena, 10 e 20 min são um ponto de partida, a calibrar com os 20 primeiros pedidos. Depois que o motoboy é atribuído, o chip muda para o **tempo no estado atual** ("A caminho da loja há 6 min") e ganha nível "Atenção" quando passa de `logistica_coleta_atencao_min` (15) e "Atrasado" em 30; "Coletado há 40 min" vira Atenção em 45 e Atrasado em 60 **[HIPÓTESE]**.

**0.5 Perfis (RN-13, **[HIPÓTESE]** até o PRD):** Logística inteira: super admin e operação. Financeiro: só **Histórico** em leitura (com custo e exportar). Suporte: leitura da Fila e do Detalhe, sem ações e sem telefone do motoboy. O item "Logística" não aparece para quem não tem acesso; link direto mostra "Você não tem acesso a essa área".

**0.6 Privacidade (pedido ao Security, `SEC-???` a abrir).** O endereço e o telefone do cliente aparecem **no Detalhe, não na lista** (a lista mostra só bairro). Abrir o Detalhe de um trabalho **ativo** não pede TOTP (o despacho precisa disso; senão a fila trava), mas **registra o acesso** (AuditRow). Depois de concluído (+`retencao_endereco_dias`, RN-14) o endereço volta mascarado e "Revelar" pede TOTP como em M1. A mensagem de WhatsApp leva dados a um terceiro: o **telefone do cliente é opcional** (caixa "Incluir o telefone do cliente", ligada por padrão, porque o motoboy precisa avisar a chegada) e o cadastro do motoboy mostra o texto de finalidade (LG4). Base legal e retenção do histórico do motoboy: Security e PO (§Z).

**0.7 Tempo real e alerta.** Novo "pronto para coleta" chega por WebSocket (fallback: consulta a cada 15 s). Efeitos: contador no item "Logística" do menu, toast "Novo pronto para coleta · Casa Bela" (não rouba o foco), título da aba "(2) Logística", e **som opcional** (Switch "Avisar com som", mesma regra do som do lojista, DS §3.1: o navegador exige um toque antes; banner "Ligar alertas sonoros"). A tela de Logística pede manter a tela acesa (Wake Lock **[HIPÓTESE]**, conforme suporte). **Limite assumido:** com a aba fechada ou o celular bloqueado não há aviso na 1.0 (push web do admin e aviso por WhatsApp custam e saem do escopo, DEC-003). Por isso o tempo de espera e o contador existem; ver §Z, risco 2. Barra de estado fixa: PanelStatusBar ("Som ligado", "Sincronizado há 3 s"; erro persistente se o som for bloqueado ou a conexão cair).

**0.8 Analytics** (sem dado pessoal): `logistics_job_created {tipo}`, `logistics_assigned {tipo, espera_min}`, `logistics_whatsapp_opened {tipo}`, `logistics_status_changed {tipo, estado}`, `logistics_not_delivered {motivo, tentativa}`, `logistics_driver_created`, `logistics_cost_set`. Vêm do servidor, exceto `logistics_whatsapp_opened` (cliente).

**0.9 Referências (resumo de busca, páginas oficiais não abertas por bloqueio de rede do sandbox: **[M]**)**

| Referência | Padrão extraído | Uso aqui |
|---|---|---|
| iFood (Envios iFood, Nuvem Envio, Central do Varejo) | Status "Buscando entregador" > "Entregador a caminho"; **código de coleta** para provar que o pedido está pronto; o entregador não vê o prazo prometido ao consumidor | Estados da §0.2 espelham a linguagem; código de coleta fica para a fase 2 (§Z); a mensagem ao motoboy **não** traz o prazo do cliente |
| Mercado Livre (Canaltech, Tecnoblog) | Opção "Devolver grátis" só aparece dentro do prazo; código ou QR para postar; reembolso em 3 dias úteis após a chegada | Fluxo de troca (`onda-5b`): ação visível só quando válida, com a data |
| Shopee (blog oficial, Tecnoblog; fontes divergem nos prazos) | Pedido em "Minhas compras" > motivo > evidências; item íntimo fora; **relatos no Reclame Aqui de reembolso cancelado quando a coleta não aconteceu no prazo** | A falha de coleta **nunca** prejudica o cliente: ver LG5 e `onda-5b` |
| Rappi | Sem fonte localizada; **não usado** | n/a |

## 1. Mapa

| Tela | Conteúdo | Quem |
|---|---|---|
| LG1 | Logística: fila (A despachar) e Em andamento | Operação, super; suporte lê |
| LG2 | Detalhe do trabalho + próximo passo | idem |
| LG3 | Atribuir motoboy e abrir o WhatsApp (folha) | Operação, super |
| LG4 | Motoboys: lista e cadastro | Operação, super |
| LG5 | Não entregue / Não coletado (folha) | Operação, super |
| LG6 | Histórico e custo por entrega | Operação, super, financeiro (leitura) |
| §2 | Mensagens de WhatsApp (modelos) | n/a |
| §3 | Impactos em telas já desenhadas | n/a |

---

## LG1. Logística: fila e em andamento (WB-??? logística, DEC-036)

**Objetivo:** ver quem espera há mais tempo e despachar. **Ação principal:** "Atribuir" no trabalho mais antigo (cada linha traz o seu botão). Menu admin > Logística (abre em "Fila"). Navegação interna: Tabs de seção rolável **Fila (3) · Em andamento (2) · Motoboys · Histórico**.

| Breakpoint | Layout |
|---|---|
| Celular < 640 | Header "Logística" + PanelStatusBar compacta. **Resumo em 2 números** (`numeral`): "3 esperando" e "Maior espera 18 min" (este em alerta com ícone quando >= 10). Chips: Todos · Entregas · Trocas · (Cidade). Lista de linhas (96), uma por trabalho, **ordenada por nível (atrasado, atenção, normal) e depois pelo mais antigo**. Sem rodapé fixo: a ação está na linha |
| Tablet 640 a 1023 | Igual, lista centrada em 640 |
| Desktop >= 1024 | 2 colunas: lista à esquerda (440, mesma linha de 96) e **detalhe LG2 à direita** sem trocar de página (padrão de M3). Resumo em 4 KPI no topo: Esperando agora, Maior espera, Em andamento, Entregues hoje |

**Linha da Fila** (a linha inteira abre o Detalhe; o botão tem alvo próprio):
- Linha 1: **WaitChip** (esquerda) e selo do tipo à direita: "Entrega" (`Package`) ou "Troca" (`ArrowsClockwise`) ou "Troca ida e volta".
- Linha 2 (`bodyStrong`): "Casa Bela > Jardim Alvorada" (loja e **bairro** do cliente; nunca a rua na lista).
- Linha 3 (`caption`): "#4821 · 3 itens · taxa R$ 7,00" (troca: "TR-1042 · Camiseta Básica · coleta grátis").
- À direita: botão `md` **"Atribuir"** (primário só no 1º da lista; os demais, secundário, para respeitar "1 primário por tela").
- Seleção múltipla (Should): "Selecionar" no cabeçalho liga caixas; BulkActionBar "Atribuir 2 ao mesmo motoboy" abre LG3 com **uma só mensagem listando os pedidos** (até 3). Só entregas da **mesma loja**; senão "Escolha pedidos da mesma loja."

**Em andamento:** mesma linha, mas a linha 1 mostra o motoboy e o tempo no estado ("João · a caminho da loja há 6 min") e o botão é o **próximo passo da linha** ("Marcar como coletado"). "Marcar como coletado" age na hora e mostra toast "Pedido #4821 coletado." com **"Desfazer" por 8 s** (reversível sem custo). "Marcar como entregue" abre o Dialog da LG2 (conclui o pedido e libera o repasse; não é um toque solto).

**Estados.**
- **Skeleton:** resumo com 2 blocos + 4 linhas com o formato real (WaitChip, 2 linhas de texto, botão).
- **Vazio (Fila):** `Motorcycle` "Nenhuma entrega esperando" / "Quando uma loja marcar pronto para coleta, aparece aqui." / "Ver em andamento". **Vazio (Em andamento):** "Nada em andamento" / "Os trabalhos atribuídos aparecem aqui." / "Ver a fila".
- **Sem resultado de filtro:** "Nenhum trabalho neste filtro." + "Limpar filtros".
- **Erro:** EP; linha com falha ao agir: "Não foi possível salvar. Nada foi alterado." + "Tentar de novo". **Conflito:** "Esse trabalho já foi atribuído a Ana, às 10:42." + "Ver trabalho". **Cancelado enquanto despachado (crítico):** a linha vira Banner de erro "O pedido #4821 foi cancelado. Avise o motoboy João." + botão "Avisar no WhatsApp" (modelo §2.4) e some só depois de "Avisei" (evita motoboy indo à loja à toa).
- **Offline:** lista do cache com "Atualizada às 10:42"; ações: "Conecte-se para atribuir. Nada foi alterado." (o botão continua ativo e explica).
- **Sucesso:** toasts acima. **Permissão:** suporte vê as linhas sem botões e com a faixa "Você pode ver, mas não despachar."

**Acessibilidade:** linha lida "Entrega, esperando há 12 minutos, atenção, Casa Bela para Jardim Alvorada, pedido 4821, 3 itens"; o nível é falado (nunca só cor); o contador é região viva educada e **não anuncia a cada minuto**, só ao mudar de nível ("Pedido 4821 atrasado"); alvo >= 48 com 8 de espaço entre linha e botão; chips com `aria-pressed`; Desfazer alcançável por teclado e leitor no toast (8 s) e também em "Mais > Voltar um passo" (sem prazo). **Textos:** "Atribuir", "Marcar como coletado", "Marcar como entregue", "Avisar no WhatsApp".

**testID** (`admin.logistica.`): `tabs`, `tab-fila`, `tab-andamento`, `summary-waiting`, `summary-longest`, `filter-all`, `filter-delivery`, `filter-exchange`, `filter-city`, `fila.row-<id>`, `fila.row-<id>-wait`, `fila.row-<id>-assign`, `andamento.row-<id>`, `andamento.row-<id>-next`, `undo`, `select-mode`, `bulk-assign`, `sound-switch`, `status-bar`, `cancelled-banner-<id>`, `cancelled-notify-<id>`, `cancelled-ack-<id>`, `empty-fila`, `empty-andamento`.

---

## LG2. Detalhe do trabalho e próximo passo

**Objetivo:** ter tudo para despachar e acompanhar um trabalho, sem abrir outra tela. **Ação principal:** o **próximo passo** (StatusAction, botão `lg` único, rodapé fixo no celular). Abre da linha da LG1, de M1 (link "Ver logística" no pedido) e de M3/AT3 (troca).

**Layout (celular, de cima para baixo):**
1. Header: voltar, "#4821 · Entrega" (ou "TR-1042 · Coleta de troca"), selo do estado, **WaitChip**.
2. **Cartão "Próximo passo"** (NextStepCard): título = o passo ("Atribua um motoboy"), 1 frase de apoio ("A loja marcou pronto às 14:10."), e o botão do passo no rodapé fixo. Se o motoboy já foi atribuído: "João foi avisado às 14:32. Aberto no WhatsApp, sem confirmação de leitura." (**o sistema não sabe se a mensagem foi enviada**; por isso o texto diz "aberto" e não "enviado").
3. **Coletar em** (loja): nome, endereço em 2 linhas, "Ligar" (`tel:`), "WhatsApp da loja", "Copiar endereço". Troca: **"Coletar com o cliente"** e o bloco do cliente vem primeiro.
4. **Entregar para** (cliente): primeiro nome e inicial ("Carla S."), endereço completo + complemento + referência, telefone com "Ligar" e "WhatsApp". Aviso de privacidade em `caption`: "Dados só para esta entrega." Mascarado depois da retenção (0.6).
5. **Pedido:** nº (link M1), "3 itens · 1 volume" (`caption`), **"Pago online. Não cobrar do cliente."** (se `cobrar_cents` > 0: "Cobrar R$ 20,00 do cliente" em `bodyStrong`; **[HIPÓTESE]**, DEC-036 cita "valor a cobrar se houver"; hoje todo pagamento é online).
6. **Motoboy e custo:** nome e telefone, "Trocar motoboy"; "Custo da corrida: R$ 6,00" com "Editar"; linha financeira (super, financeiro, operação): "Taxa cobrada do cliente R$ 7,00 · Custo R$ 6,00 · **Resultado R$ 1,00**" (só com custo informado; negativo em `text.danger` com `TrendDown` e a palavra "prejuízo").
7. **Recado para o motoboy** (opcional, até 140; vai na mensagem).
8. **Linha do tempo** (StatusTimeline do trabalho; ator, hora): Pronto às 14:10 (loja) > Atribuído às 14:32 (Ana) > Coletado às 14:44 > Entregue às 15:05. Mostra os **intervalos** ("Esperou 22 min · coleta 12 min · entrega 21 min") para o fundador achar o gargalo.
9. Menu **Mais:** "Reenviar mensagem" · "Copiar mensagem" · "Trocar motoboy" · "Voltar um passo" (auditado) · "Não entregue" · "Cancelar despacho" (só se não coletado; devolve à Fila).

**Botão do passo por estado:**

| Estado | Botão `lg` | O que acontece |
|---|---|---|
| Pronto para coleta | "Atribuir motoboy" | Abre LG3 |
| Motoboy a caminho da loja | "Marcar como coletado" | Muda na hora; toast com "Desfazer" 8 s |
| Coletado | "Marcar como entregue" | Dialog (abaixo) |
| Entregue / Não entregue | sem botão | Resumo + "Ver pedido" |

**Dialog "Marcar como entregue?"** "Isso conclui o pedido #4821 e libera o repasse da loja." Campos: **Custo da corrida** (preenchido com o valor da atribuição; obrigatório se vazio: "Informe o custo da corrida.") e **Foto do comprovante** (opcional, a foto que o motoboy mandou pelo WhatsApp; ajuda na disputa "não recebi"; mesmos limites de FileUpload e retenção do pedido). Botões: "Marcar como entregue" · "Cancelar". Troca: o Dialog diz "Isso conclui a coleta e avisa a loja para conferir a peça."

**Estados.** Skeleton: cartão + blocos. Vazio: n/a (trabalho não encontrado: "Não encontramos esse trabalho." + "Voltar à fila"). Erro: EP; transição negada ("Esse trabalho mudou para Entregue. Atualizamos a tela."). Offline: detalhe em cache; "Conecte-se para atualizar. Nada foi alterado." Sucesso: toasts "Pedido #4821 coletado." / "Pedido #4821 entregue. O cliente foi avisado." Permissão: suporte sem botões; financeiro sem acesso a esta tela (só ao Histórico).
**Acessibilidade:** foco no título ao abrir; o botão do passo é o último foco antes de "Mais"; endereços como texto selecionável (não só imagem); "Ligar" e "WhatsApp" com rótulo "Ligar para a Casa Bela"; tempos com unidade falada.
**testID:** `detail`, `status`, `wait`, `next-card`, `next-action`, `store-block`, `store-call`, `store-whatsapp`, `store-copy-address`, `customer-block`, `customer-call`, `customer-whatsapp`, `customer-copy-address`, `payment-note`, `driver-block`, `driver-change`, `cost-value`, `cost-edit`, `margin`, `note-input`, `timeline`, `more-menu`, `resend`, `copy-message`, `undo-step`, `not-delivered`, `cancel-dispatch`, `delivered-dialog`, `delivered-cost`, `delivered-proof`, `delivered-confirm`.

---

## LG3. Atribuir motoboy e abrir o WhatsApp (folha)

**Objetivo:** escolher quem vai e mandar os dados em um toque. **Ação principal:** **"Atribuir e abrir WhatsApp"** (rodapé fixo da folha, `lg`). BottomSheet no celular (altura até 90%); Dialog de 480 no desktop. Abre do botão "Atribuir" (LG1) ou do passo da LG2.

**Layout:**
1. Título "Quem vai buscar o #4821?" e resumo de 1 linha "Casa Bela > Jardim Alvorada · taxa R$ 7,00".
2. **Lista de motoboys** (rádio, linha de 64): nome, "Livre" (sucesso, ícone) ou "Em corrida: 1" (neutro), celular. **Livres primeiro**, depois menos corridas abertas. Busca aparece com mais de 8. O último escolhido para a mesma loja vem pré-selecionado **[HIPÓTESE]**.
3. **Custo da corrida** (moeda): preenchido com o "valor padrão" do motoboy; sem padrão, vazio e obrigatório ("Informe o custo da corrida.").
4. **Recado** (opcional, 140): "Ex.: tocar a campainha 2 vezes".
5. Caixa "Incluir o telefone do cliente" (ligada). Troca: "Dia da coleta" em chips (Hoje · Amanhã · Escolher) que o cliente vê como "Coleta prevista: amanhã".
6. **Prévia da mensagem** recolhida ("Ver mensagem", texto somente leitura, §2) com "Copiar mensagem".
7. Rodapé: botão `lg` **"Atribuir e abrir WhatsApp"**; texto "Só atribuir, sem mensagem" (para quem já combinou por telefone).

**Como funciona o botão (decisão técnica de UX).** O botão é um **link `wa.me` (âncora real)** tocado diretamente, que dispara ao mesmo tempo o registro da atribuição (requisição com chave de idempotência). Motivo: navegadores móveis bloqueiam janela aberta depois de uma espera de rede (Safari iOS e alguns Android) **[M, validar em iOS Safari e Chrome Android]**; abrir primeiro e confirmar depois é o que sobrevive. Se o registro falhar, ao voltar ao painel aparece Banner de erro "A mensagem abriu, mas não conseguimos registrar a atribuição." + "Tentar de novo" e o estado volta a "Pronto para coleta". Número no formato internacional sem sinais (`https://wa.me/5511912345678?text=<mensagem codificada>` **[M]**, a página oficial do WhatsApp não abriu no sandbox). Mensagem com mais de ~1.500 caracteres é encurtada (retira o recado) com aviso. **Alternativa sempre visível:** "Copiar mensagem" (WhatsApp Business, grupo ou WhatsApp não instalado: "Sem WhatsApp neste aparelho. Copie a mensagem e envie por onde preferir.").

**Estados.** Skeleton: 4 linhas de motoboy. **Vazio (nenhum motoboy):** `Motorcycle` "Nenhum motoboy cadastrado" / "Cadastre o primeiro para despachar." e o **formulário inline** (Nome e Celular, "Cadastrar e atribuir"), sem sair da folha. Erro: EP; "João foi desativado. Escolha outro." Offline: "Conecte-se para atribuir. Nada foi alterado." (o botão não abre o WhatsApp offline). Sucesso: folha fecha, toast "Atribuído a João. Mensagem aberta no WhatsApp." Permissão: n/a.
**Acessibilidade:** rádio em grupo "Motoboy" com "João, livre, (11) 91234-5678"; foco no título; fecha por Fechar, arrastar, voltar do Android; o botão traz o nome ("Atribuir a João e abrir WhatsApp"). **Android x iOS:** o link abre o app do WhatsApp; no iOS, a volta ao Safari/PWA é manual (o painel mantém o estado). **testID:** `assign-sheet`, `driver-option-<id>`, `driver-search`, `cost-input`, `note-input`, `include-phone`, `pickup-day-today`, `pickup-day-tomorrow`, `pickup-day-pick`, `message-preview-toggle`, `message-preview`, `copy-message`, `submit-whatsapp`, `submit-only`, `inline-driver-name`, `inline-driver-phone`, `inline-driver-submit`, `register-failed-banner`, `register-retry`.

---

## LG4. Motoboys: lista e cadastro

**Objetivo:** manter a lista de quem entrega. **Ação principal:** "Adicionar motoboy". Tab "Motoboys".

| Breakpoint | Layout |
|---|---|
| Celular | Lista (ListItem 72): nome, celular, "3 corridas hoje" (`caption`), Switch **"Ativo/Inativo"** com texto. Botão `lg` "Adicionar motoboy" fixo no rodapé |
| Desktop | DataTable: Nome, Celular, Valor padrão, Corridas no mês, Ativo (Switch), "Editar"; botão no cabeçalho |

**Formulário** (folha no celular; Dialog no desktop; sem mapas, sem documentos): **Nome** (obrigatório, "Escreva o nome do motoboy.") · **Celular com WhatsApp** (máscara, "Confira o celular com DDD."; duplicado: "Esse celular já é do João.") · **Valor padrão por corrida** (moeda, opcional; ajuda "Já vem preenchido ao atribuir.") · **Observação** (opcional, 100, ex.: "Moto vermelha"). Botões: "Salvar motoboy" (primário), **"Testar WhatsApp"** (abre `wa.me` com "Oi, João. Teste de cadastro da Webag." para provar que o número tem WhatsApp). Texto de finalidade `caption`: "Usamos nome e celular só para despachar entregas e registrar o custo."
**Regras:** não existe "Excluir" (o histórico precisa do nome); **desativar** tira da lista de atribuição e mantém o histórico. Desativar com corrida em andamento: bloqueia, "João tem 1 corrida em andamento. Troque o motoboy antes." Reativar: 1 toque. Alterar celular com corridas abertas: Dialog "O novo número vale para as próximas mensagens."
**Estados.** Skeleton: 4 linhas. Vazio: `Motorcycle` "Nenhum motoboy cadastrado" / "Cadastre quem entrega para despachar mais rápido." / "Adicionar motoboy". Erro: EP; salvar: "Não foi possível salvar. O que você digitou continua aqui." Offline: EP. Sucesso: toast "João cadastrado." / "João desativado." (com "Desfazer"). Permissão: operação e super; os demais: Sem acesso.
**Acessibilidade:** Switch "João, ativo"; telefone lido por dígitos; teclado de telefone (`inputMode="tel"`, `autocomplete="tel"` não, pois é terceiro: `autocomplete="off"`). **testID:** `drivers.list`, `drivers.item-<id>`, `drivers.item-<id>-switch`, `drivers.add`, `drivers.name-input`, `drivers.phone-input`, `drivers.default-cost-input`, `drivers.note-input`, `drivers.test-whatsapp`, `drivers.submit`, `drivers.deactivate-blocked`, `drivers.empty`.

---

## LG5. Não entregue e não coletado (folha)

**Objetivo:** registrar o que houve e decidir o próximo passo **sem prejudicar o cliente**. **Ação principal:** "Registrar e tentar de novo" ou "Registrar e encerrar" (conforme a escolha). Entra por "Mais > Não entregue".

**Layout:** título "O que aconteceu?" · rádios de motivo (alvo 56): **Cliente ausente · Endereço não encontrado · Cliente recusou receber · Pedido não estava pronto na loja · Problema com o motoboy · Outro** (Outro exige texto, 10 a 140) · **Foto ou observação** (opcional) · **Próximo passo** (rádio): **"Tentar de novo"** (volta à Fila com o selo "2ª tentativa" e mantém o tempo) ou **"Encerrar entrega"**. Padrão pré-marcado: "Tentar de novo" para ausência, endereço e problema com o motoboy; "Encerrar" para "Cliente recusou".
- **Encerrar** abre o fluxo de cancelar e estornar (M2) **já preenchido** com o motivo e mostra o efeito antes: "O pedido volta para a loja. O cliente recebe R$ 98,00 de volta." **Quem arca com o custo da entrega frustrada não está decidido** (§Z, pergunta 3); a tela não promete nada além do estorno.
- **Tentativas:** até 2 reagendamentos (como WB-173 C3); na 3ª "Encerrar" é o único caminho. Coleta de troca: "Não coletado" segue a mesma regra e, esgotadas as tentativas, a troca vira "Expirada **por falha da Webag**": **o cliente não perde o direito nem a taxa** (a taxa é estornada) e o prazo dele é estendido; o texto avisa o admin: "O cliente não será prejudicado." (padrão ruim visto no Shopee: coleta que não acontece cancela o reembolso, ver 0.9).
- O cliente recebe aviso automático ("Não conseguimos entregar o pedido #4821. Falar com a loja") **[HIPÓTESE, PRD de notificações]**.

**Estados.** Skeleton: n/a. Vazio: n/a. Erro: "Escolha o que aconteceu." (ao tocar no botão; rola e foca) · "Escreva o motivo (mínimo 10 letras)." Offline: "Conecte-se para registrar. Nada foi alterado." Sucesso: toast "Registrado. Pedido #4821 voltou para a fila (2ª tentativa)." / "Entrega encerrada. Abrimos o estorno." Permissão: operação e super.
**Acessibilidade:** rádios em `fieldset` "Motivo"; efeito do "Encerrar" em região viva educada. **testID:** `notdelivered-sheet`, `reason-absent`, `reason-address`, `reason-refused`, `reason-not-ready`, `reason-driver`, `reason-other`, `reason-text`, `proof`, `next-retry`, `next-close`, `effect`, `submit`.

---

## LG6. Histórico e custo por entrega

**Objetivo:** saber se as entregas se pagam e achar um caso antigo. **Ação principal:** abrir um trabalho (e "Exportar CSV" como apoio). Tab "Histórico".

| Breakpoint | Layout |
|---|---|
| Celular | Filtro de período em chips (Hoje · 7 dias · Mês · Escolher) e botão "Filtros" (folha: motoboy, tipo, resultado, loja, cidade, "Sem custo informado"). **Resumo em 4 números** com legenda: Corridas, Custo total, Taxa recebida, Resultado. Lista de linhas (72): "#4821 · Casa Bela", motoboy e data, **custo** à direita, selo do resultado |
| Desktop | KPI (4) + DataTable: Data, Trabalho, Tipo, Loja, Bairro, Motoboy, Espera (min), Total (min), Taxa do cliente, **Custo**, Resultado, Estado. Ordenável; paginação 25/50/100; "Exportar CSV" no cabeçalho |

- **Resultado** = taxa cobrada do cliente (ou da troca) menos custo; negativo mostra `TrendDown` + "prejuízo". Linha sem custo: selo "Sem custo" (alerta) e o chip de filtro "Sem custo informado" para o fechamento do dia. **Tempo médio de espera** e **de entrega** aparecem como 2 KPIs extras em "Mais indicadores" (recolhido).
- **Por motoboy** (visão agrupada, Should): corridas, custo total e média, para conferir o pagamento fora do app (DEC-036c). "Exportar CSV" respeita filtros e é auditado (como M1).
- **Editar custo depois de entregue:** permitido, grava o antes e o depois na auditoria (AuditRow), sem pedir motivo (evita atrito).
- Visibilidade do custo: super, financeiro e operação; suporte não vê **[HIPÓTESE]**.

**Estados.** Skeleton: KPIs + 8 linhas. Vazio: `Receipt` "Nenhuma entrega no período" / "Os trabalhos concluídos aparecem aqui." / "Ver este mês". Sem resultado de filtro: "Nenhum trabalho neste filtro." + "Limpar filtros". Erro/Offline: EP; lista do cache "Atualizada às 10:42". Sucesso: toast "Exportação pedida. Registrada na auditoria." Permissão: financeiro em leitura (sem editar custo).
**Acessibilidade:** tabela com cabeçalhos e ordenação anunciada; valores por extenso ("6 reais"); resultado negativo lido "prejuízo de 2 reais". **testID:** `history.period-today`, `history.period-7d`, `history.period-month`, `history.period-custom`, `history.filters`, `history.kpi-count`, `history.kpi-cost`, `history.kpi-fee`, `history.kpi-result`, `history.row-<id>`, `history.no-cost-badge`, `history.filter-no-cost`, `history.export`, `history.by-driver`, `history.empty`.

---

## 2. Mensagens de WhatsApp (modelos; texto puro, sem emoji; negrito do WhatsApp com asterisco)

Variáveis entre `{ }`. O admin **não edita** o corpo (consistência e menos erro); só o "Recado". Link: `https://wa.me/55{DDD}{numero}?text={mensagem codificada}` **[M]**.

**2.1 Entrega**
```
*Webag · Entrega #{numero}*
Buscar na loja: {loja}
Endereço: {rua_loja}, {numero_loja} - {bairro_loja}
Contato da loja: {tel_loja}

Entregar para: {nome_cliente}
Endereço: {rua}, {numero} {complemento} - {bairro}, {cidade}
Referência: {referencia}
Contato do cliente: {tel_cliente}

{Pago online. Não cobrar do cliente.  |  Cobrar do cliente: R$ {valor}}
Volumes: {n}
{Recado: {recado}}

Responda aqui quando coletar e quando entregar.
```
**2.2 Coleta de troca (só buscar e levar à loja)**
```
*Webag · Coleta de troca #{TR}*
Buscar com: {nome_cliente}
Endereço: ... Referência: ... Contato: {tel_cliente}
Combinar o horário com o cliente. Dia previsto: {dia}
Peça: {item} {variacao}. Deve estar na embalagem, com etiqueta.
Levar para: {loja}, {endereco_loja}. Contato: {tel_loja}
Não cobrar nada do cliente.
{Recado}
Responda aqui quando coletar e quando entregar na loja.
```
**2.3 Troca ida e volta (peça nova e antiga na mesma viagem)**
```
*Webag · Troca #{TR} (ida e volta)*
1) Buscar a peça NOVA na loja: {loja}, {endereco}, {tel_loja}
2) Entregar para: {cliente}, {endereco}, {tel}
3) Pegar com o cliente a peça ANTIGA ({item} {variacao}, na embalagem, com etiqueta). Confira se é a mesma peça.
4) Levar a peça antiga de volta à loja.
Não cobrar nada do cliente. {Recado}
Responda aqui a cada etapa.
```
**2.4 Cancelamento**
```
*Webag · Corrida #{numero} cancelada.* Não precisa buscar nem entregar. Obrigado.
```
Regra: o motoboy **não** recebe o prazo prometido ao cliente nem o valor dos itens (iFood faz o mesmo com o prazo [S]).

## 3. Impactos em telas já desenhadas (não redesenhadas aqui; o dev e o PO precisam saber)

| Tela | Mudança por DEC-036 |
|---|---|
| **P2** (`onda-4`, lojista, detalhe do pedido) | Em entrega, o botão de separação termina em **"Marcar como pronto para coleta"** (retirada segue "pronto para retirar"). Somem "Marcar como saiu para entrega", "Marcar como entregue" e "Entrega não realizada" do lojista. Depois de pronto, o lojista vê só leitura: "Aguardando o motoboy da Webag há 8 min" > "João vem buscar" (nome do motoboy, sem telefone) > "Coletado". Se passar de 20 min: botão "Falar com a Webag" (WhatsApp de suporte). Dialog: "Marcar como pronto para coleta?" / "A Webag chama o motoboy agora. Deixe o pedido embalado no balcão." |
| **S7** (cliente) | Textos da §0.3; "Atraso" (banner existente) também dispara com espera de motoboy |
| **C4** (`onda-2`, lojista, Entrega e retirada) | **Obsoleta** na parte de raio, faixas e taxa (DEC-036b). Vira 2 Switches "Entrega pela Webag" e "Retirada na loja" (+ retirada atual). Pede redesenho curto; **não feito nesta rodada** |
| **Admin: taxas** | Falta tela de "Taxa de entrega por região/faixa" e "pedido mínimo e frete grátis" (DEC-036a/b): proposta no próximo lote, junto com AT2 de `onda-5b` |
| **M1** (admin pedidos) | Linha e detalhe ganham o estado de logística e o link "Ver logística" |
| **X1, X2, T1, T2** (troca) | Substituídas por `onda-5b-troca.md` |

## Z. Hipóteses, riscos e perguntas

**Riscos (nomeio, não escondo):**
1. **Tudo depende de uma pessoa tocar em "Entregue".** Esse toque libera o repasse, abre a avaliação e começa o prazo de troca do cliente. Se o fundador esquecer, o cliente fica sem avaliar e sem trocar. Mitigação no desenho: nível "Atrasado" para "coletado há 60 min", filtro "Coletados sem conclusão" e o resumo do dia ("2 coletados sem entrega"). Solução de verdade: página do motoboy com token (fase 2, DEC-036e). **PO decide** se há conclusão automática (ex.: 3 h depois do coletado) com aviso ao cliente.
2. **Sem alerta com a aba fechada** (0.7). Se os pedidos esperam sem ninguém olhando, a promessa de entrega quebra. Proposta [HIPÓTESE]: o fundador manter a Logística aberta no horário de funcionamento na 1.0 e medir quantos pedidos ficam >= 20 min; se for comum, pedir autorização para push web ou aviso por WhatsApp (custa; DEC-003).
3. **WhatsApp é um canal fora do sistema:** não há confirmação de que o motoboy recebeu ou aceitou; "A caminho da loja" é uma afirmação do admin. Se o motoboy não responde, o fundador só descobre pelo tempo no estado (Atenção a 15 min).
4. **Dado pessoal vai ao WhatsApp do motoboy** (nome, endereço, telefone do cliente). Security: base legal (execução do contrato), minimização (telefone opcional já previsto), retenção e o que fazer com o histórico do aparelho do motoboy.
5. **Troca ida e volta entrega a peça nova antes de conferir a antiga** (a loja só inspeciona quando a peça volta). Risco de fraude (peça diferente). Mitigação: a mensagem pede conferência pelo motoboy; o PO avalia limitar ida e volta a trocas de valor baixo ou clientes sem histórico de disputa.

**Perguntas ao PO (`logistica.md`):** (1) limites de 10/20 min e janelas de coleta; (2) a taxa de entrega é a única receita de logística e o resultado por corrida (taxa menos custo) deve aparecer ao admin? (proposto: sim); (3) quem arca com entrega frustrada por cliente ausente; (4) perfis: suporte e financeiro na Logística; (5) conclusão automática; (6) valor a cobrar (dinheiro na entrega) existe na 1.0? (proposto: não; campo fica preparado); (7) "Retira Troca" como nome do recurso no app (usei "Coleta em casa" no texto ao cliente).
**Perguntas ao Security:** 0.6 (acesso ao endereço sem TOTP em trabalho ativo, retenção, WhatsApp).
**[HIPÓTESE] a validar com o fundador (30 min, 5 despachos reais):** a ordem Fila > Atribuir > Coletado > Entregue cabe em uma mão; "Atribuir e abrir WhatsApp" em 1 toque; mensagem do §2 entendida pelo motoboy sem pergunta.
