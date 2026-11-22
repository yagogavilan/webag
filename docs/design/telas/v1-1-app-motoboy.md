# Tela: App do motoboy (turno, rota, paradas, entrega, privacidade)   (WB-383 C2, WB-384, WB-385, WB-386, WB-387, WB-389)

> Autor: product-designer. Data: 2026-11-22. Release R4. Protótipo: `v1-1-logistica-e-analises.html#/m/turno`, `/m/oferta`, `/m/pedidos`, `/m/parada?i=0`, `/m/mapa`, `/m/codigo`, `/m/problema`, `/m/fim`, `/m/privacidade`, `/m/permissao?v=pedir|negada|gpsoff`, `/m/entrar?v=convite|invalido|versao|revogado`, `/m/instalar`. Controles: sinal (ok, sem rede, GPS desligado), modo (App Android ou Navegador/PWA), bateria 80, 18, 8, "GPS fraco", permissão. Fluxo: `docs/design/fluxos/v1-1-turno-motoboy.md`.
> Desenhado para **celular em pé, uma mão, sol forte, luva**: alvos >= 56 px (primário 72 px), texto 18 a 20 px, **fundo branco e texto noite** (contraste > 15:1; tema escuro some ao sol), **uma ação principal por tela, fixa no rodapé** (alcance do polegar), nenhum gesto obrigatório.

## 0. Decisões de UX (o CEO valida)

| # | Decisão | Por quê |
|---|---|---|
| 1 | **PWA não rastreia com o Waze aberto; só o app Android rastreia.** A mesma interface roda nos dois, mas **no modo navegador** o app diz em faixa fixa: "Modo navegador. O cliente só vê você enquanto esta tela estiver aberta. Para aparecer no mapa durante a navegação, use o app Android." e, ao tocar "Abrir no Maps ou Waze", avisa "o Webag para de enviar a sua posição até você voltar" | Pesquisa §8 do PRD: Chrome para o GPS em segundo plano. Prometer rastreio que não existe quebra a confiança do cliente. O PWA serve ao piloto e a quem usa iPhone, sem mapa contínuo |
| 2 | **Menu escondido no topo, ação no rodapé.** Navegação (Turno, Meus pedidos, Privacidade, Versão, Falar com a operação) fica atrás de um botão de menu de 48 px; as telas de trabalho têm só o botão da etapa | Barra inferior de 5 abas + botão de ação = 2 faixas fixas em 640 px de tela |
| 3 | **Botão da etapa muda sozinho**: Cheguei à loja, Peguei o pedido, Aguardando a loja confirmar (desabilitado, com texto), Cheguei ao cliente, Entreguei. Botão fora de ordem **não existe** (C9) | Evita erro e dispensa o motoboy de pensar |
| 4 | **"Abrir no Maps ou Waze" é botão grande separado** (secundário, 60 px) em toda parada; lembra a escolha | Pedido do PRD; o motoboy já navega assim |
| 5 | **Código de entrega com teclado numérico próprio** (teclas de 68 px) e confirmação **automática ao 4º dígito**; erro mostra tentativas restantes; 3 erros trancam e oferecem "Chamar a operação" | O teclado do sistema cobre metade da tela e tem teclas pequenas; um toque a menos |
| 6 | **Sem valor e sem cobrança**: tag "Pedido já pago. Não cobre nada do cliente." | RN-D8/D9; evita o motoboy cobrar por engano |
| 7 | **Telefone do cliente só por botão "Ligar para Carla"**, número nunca na tela, só durante a corrida | RN-D8 |
| 8 | **Turno não coleta localização.** "Disponível" = receber oferta; o GPS liga só ao aceitar. A tela repete: "A localização só liga durante uma corrida aceita." | RN-D7; reduz o risco de vínculo (J8) e a bateria |
| 9 | **Aceite do aviso de localização no 1º acesso** com 4 pontos curtos e "Li e aceito" | WB-383 C2 / J26 |
| 10 | **Mensagem de privacidade nunca promete ranking nem punição**; diz o que **não** se faz ("Não usamos a sua localização para ranking, nota, bônus ou desconto.") | C6 da WB-389 `[PO confirma que a negativa é desejada]` |

## 1. Telas (conteúdo real)

| Rota | Conteúdo |
|---|---|
| **Entrar** | Convite: "Convite de Carlos", 4 pontos de privacidade, caixa "Li e aceito", botão **Entrar**. Variantes: Convite inválido ("Este convite já foi usado ou venceu. Peça outro à operação."), Atualize para continuar, Acesso encerrado, todas com **Falar com a operação** |
| **Permissão** | Pré-diálogo: "Para o cliente ver onde você está, o app usa a localização **só durante uma corrida**." 3 passos numerados (Permitir localização; no Android 10+ escolher "Permitir o tempo todo", **com a razão**: sem isso o rastreio para quando abre o Waze; voltar ao Webag). Negada: "Sem permissão de localização. Sem ela, você não aceita corridas." + **Abrir configurações**. GPS desligado: "O GPS está desligado." |
| **Meu turno** | Faixa "Você está disponível. Avisamos com som e vibração quando chegar uma rota." (ou "Fora do turno. Você não recebe corridas."); cartão "Nova rota: 3 entregas, responda em 2:41" **ou** "Rota em andamento, parada 2 de 5"; "Entregues hoje" e "Não entregues"; botão **Iniciar turno** / **Encerrar turno**; link Privacidade. Encerrar com rota ativa: "Você tem uma rota em andamento. Termine as paradas ou fale com a operação." **Sem ganhos** |
| **Nova rota** | Contagem de 3:00 ("para responder. Se passar, a rota volta para a fila, sem problema."), 3 números (entregas, volumes, tempo estimado), lista das paradas, "Você pode seguir outra ordem. Recusar não tem penalidade." Rodapé: **Aceitar rota**, **Recusar**. Sem localização: aviso e botão `aria-disabled` |
| **Meus pedidos** | Mapa pequeno (rota, paradas numeradas, "Você"), "Ampliar o mapa", dicas ("Você está na loja. Toque em Cheguei à loja."), "Aguardando a loja confirmar. A loja já foi avisada e lembrada", "Confira ao pegar" (pedidos e volumes), **lista de paradas** (Feito, Agora, Depois) e rodapé com a ação da etapa e "Abrir no Maps ou Waze" |
| **Parada** | Endereço em 26 px, bairro e cidade, **observação do cliente** em faixa âmbar, pedidos e volumes, tag "Pedido já pago", **Ligar para Carla** ou **Falar com a loja no WhatsApp**, **Abrir no Maps ou Waze** |
| **Mapa** | Rota inteira ou "Centralizar em mim", próxima parada em texto, botão grande de abrir o navegador |
| **Código** | "Peça ao Rafael o código de 4 dígitos.", 4 caixas, teclado numérico, "Sem código? Não consegui entregar". Erro: "Código incorreto. Peça de novo ao cliente. Restam 2 tentativas." Bloqueio: "Entrega bloqueada. Você errou 3 vezes. Chame a operação para fechar esta entrega." + **Chamar a operação** |
| **Não consegui entregar** | Motivo (Cliente ausente, Endereço não encontrado, Cliente recusou o pedido, Local sem segurança, Outro), "Tentar ligar antes", "O cliente é avisado na hora e a operação combina uma nova tentativa." Botão **Registrar: não consegui entregar** (vermelho) |
| **Rota concluída** | "3 entregas feitas", pendências de envio, "A localização foi desligada." |
| **Privacidade** | O que coleta, quem vê, por quanto tempo (7 dias), **Ver meus pontos das últimas corridas**, canal para pedir dados, versão do aceite, atribuição "© OpenStreetMap" (licença) |
| **Instalar o app** | Só Android, versão e código de conferência, 4 passos (liberar fonte, Play Protect, instalar, aceitar o aviso), aviso de iPhone (segue por WhatsApp) |

## 2. Estados e avisos (faixas no topo, com ícone e texto)

| Situação | Texto |
|---|---|
| **Sem sinal** | "Sem sinal. Seus toques ficam salvos e sobem quando a rede voltar. 2 ações aguardam envio." Todos os botões funcionam |
| **Código sem sinal** | "Sem sinal. Guardamos o código e conferimos quando a rede voltar." (a entrega fica "aguardando conferência") `[pergunta 1 ao PO e Security]` |
| **GPS desligado em corrida** | "GPS desligado. O cliente não vê onde você está. [Ligar GPS]" |
| **GPS fraco** | "GPS fraco. A posição pode estar errada. Vá para um lugar aberto." |
| **Bateria <= 20%** | "Bateria em 18%. Ligue o carregador. O app continua funcionando." |
| **Bateria <= 10%** | "Bateria em 8%. O aparelho pode fechar o app. Ligue o carregador e desative a economia de bateria para o Webag." |
| Longe do endereço (> 300 m) | Diálogo "Você está longe do endereço. Faltam cerca de 850 m. Chegou mesmo?" [Ainda não] [Sim, cheguei]; vale e registra |
| Sem corridas | "Sem corridas agora. Você está disponível. Avisamos quando chegar uma rota." |
| Oferta expirada | "Esta rota voltou para a fila." |
| Carregando, erro | Esqueleto; "Não conseguimos carregar agora. Seus dados estão salvos. Tente de novo em instantes." |
| Rota cancelada pela operação | Aviso na hora, a parada some (C6 da WB-384) `[estado a detalhar com o dev]` |

## 3. Acessibilidade e campo

Alvo mínimo 56 px; primário 72 px; espaço >= 10 px entre botões. Texto >= 18 px, escala do sistema até 200% sem corte (rodapé rola). Contraste texto/fundo > 15:1; avisos usam ícone + texto + cor. Ordem de leitura = ordem visual. Mudança de etapa e erro de código anunciados (`aria-live`). Vibração junto do som na oferta. Sem gesto de arrastar, sem toque longo, sem toque duplo. Código: teclas com rótulo numérico. Redução de movimento: sem tremor no erro do código. Nenhuma informação só por cor (Feito/Agora/Depois em texto).

## 4. Diferenças app x PWA

| | App Android | Navegador (PWA) |
|---|---|---|
| GPS com Waze aberto | Sim, notificação fixa "Webag Entregas: corrida em andamento" | **Não** |
| Aviso de modo | n/a | Faixa fixa e aviso ao abrir o mapa |
| Oferta | Push com som e vibração | Notificação web quando permitida; sem garantia |
| Instalação | APK por convite (`/m/instalar`) | Adicionar à tela inicial |
| iPhone | Não suporta | Único modo, sem rastreio contínuo |

## 5. Eventos

`courier_offer_accepted` (seconds), `courier_offer_declined`, `courier_step` (step, source), `delivery_code_failed`, `courier_offline_flush`, `courier_signal_lost`, `location_permission` (granted, denied, gps_off), `battery_warning` (nível), `pwa_nav_away`. Sem nome, endereço ou posição.

## 6. Mapa WB para a tela

| História | Onde |
|---|---|
| WB-383 C2 | Entrar (aceite) e Privacidade |
| WB-384 C1 a C6 | Nova rota, Meu turno, estados (C5 última rota salva e "Sem conexão") |
| WB-385 C1 a C6 | Instalar o app (C1, C2, C4, C5); C3 "Atualize para continuar" em Entrar?v=versao |
| WB-386 C1 a C9 | Meus pedidos, Parada, Código, Não consegui entregar (C4 longe do endereço, C6 bloqueio, C8 idempotência, C9 botão ausente) |
| WB-387 C1 a C8 | Permissão, faixas de GPS e bateria, notificação fixa (é do sistema), C8 reabrir sem novo aceite |
| WB-389 C1 a C6 | Privacidade |

## 7. Revisão heurística

**Nota 4 de 5.** AM-1 (sev. 3, H5): código sem sinal é o buraco do desenho: sem rede o app não confere o código; "guardar e conferir depois" permite entrega sem prova se o motoboy digitar qualquer coisa. Precisa de regra do PO e Security (revisão posterior pela operação, ou bloquear até ter sinal). AM-2 (sev. 3, H1): no PWA o rastreio some sem o motoboy perceber; mitigação: faixa fixa e aviso ao abrir o mapa (já no protótipo); a decisão real é só distribuir o APK. AM-3 (sev. 2, H7): a recusa da oferta não pede motivo (sem penalidade) mas a operação perde o dado; medir antes de pedir. AM-4 (sev. 2, H6): repetir a mesma ação de navegar toda vez; já lembra a escolha. Bom: uma ação por tela, botão que muda sozinho, sem valores, privacidade explicada na hora. **Teste em campo:** 3 motoboys, sol, uma mão, 3 entregas; medir toques até concluir, erros de código e leitura da tela ao sol.

## 8. Perguntas

| Para | Pergunta |
|---|---|
| PO / Security | 1. Código sem sinal: guardar e conferir depois, ou bloquear? 2. A negativa "não usamos para ranking" é desejada? 3. Espera mínima antes de registrar "cliente ausente"? 4. Motoboy vê o valor da corrida? (RN-D9 diz não; fundador) |
| mobile-dev | 5. Notificação fixa e permissão "o tempo todo" no Android 14 e 15: textos do sistema variam 6. App separado `apps/courier` x perfil no app do cliente (DEC-087) |
| Fundador | 7. Quem fornece o aparelho e o plano de dados do motoboy 8. Testar o APK com 1 motoboy real antes de G5 |
