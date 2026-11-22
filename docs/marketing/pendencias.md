# Pendências das apresentações v2 (lojista e cliente)

Peças: `src/apresentacao-lojista.html` (14 slides: 7 de conversa, 1 divisor, 6 de guia) e `src/apresentacao-cliente.html` (**5 slides na v2.1**; eram 8). Autor: product-designer. Data: 2026-11-22. Revisão por slide: `revisao-decks-v2.md`.
**v2.1 (2026-11-22, aplica a avaliação da estrategista): ver "V2.4" no fim desta seção. Onde a tabela V2.1/V2.2 abaixo fala de slides do cliente, a numeração é a da v2 (s4 = "Ela está no app", s5 = acompanhamento, s6 e s7 cortados, s8 = contato; hoje s3, s4 e s5).**
`[HIPÓTESE]` = não validado. As seções "v1" mais abaixo estão obsoletas (história); o que continua valendo foi trazido para cá.

## V2.1 Confirmar antes de imprimir

| # | Item | Onde | Ação |
|---|---|---|---|
| V1 | **"Sem mensalidade"** (adesivo). Só existe em DEC-008 (mensalidade rejeitada) e no posicionamento §5.2; não está no brief nem em regras de negócio | Lojista s5 | Fundador confirmar por escrito; senão apagar o `.tag` "Sem mensalidade" (uma linha no HTML) |
| V2 | **Comissão de 15%** é exemplo `[HIPÓTESE]` (HIP-C01) e **tarifa de pagamento de até 4,98%** (HIP-C02, conferir contrato do Mercado Pago). Conta: 100 − 15 − 4,98 = 80,02, exibido como "cerca de R$ 80" e "até R$ 5". A tarifa aparece como desconto sem nomear método | Lojista s5 | Rótulo "exemplo ilustrativo; condições finais no cadastro" está no slide (24 px). Jurídico: J5 (pode ser lido como proposta) |
| V3 | **"Cai na sua conta"** depende do split do Mercado Pago em produção (H4); no modo centralizado o texto muda | Lojista s5 | Confirmar o modelo antes de imprimir |
| V4 | **"Aceite em até 10 minutos"** e "sem resposta, o pedido é cancelado" são `[HIPÓTESE]` (HIP-008, parâmetro editável no admin) | Lojista s12 | Confirmar o valor padrão |
| V5 | **"O motoboy do Webag busca"/"Você separa. O Webag leva."/"Aquela loja agora entrega"**: parecer jurídico sobre motoboys (DEC-039, J8). Nenhuma peça externa sai antes do parecer e do G5 | Lojista s3 e s13; Cliente s1 a s3 | Aguardar jurídico. Plano B sem entrega: avisar o designer, as duas ideias centrais mudam |
| V6 | "Peça a troca pelo app" (J2) e "O Webag não guarda os dados do seu cartão" (J3): redação a validar; sem prazo nem condição de troca | Cliente s6; Lojista s6 | Jurídico |
| V7 | Documentos exigidos (CPF: RG ou CNH e comprovante; CNPJ/MEI: cartão CNPJ e documento do responsável) estão em revisão jurídica no PRD (J4) | Lojista s9 | Jurídico |
| V8 | **Lista de abertura** ("Seu nome na lista de abertura", linhas para escrever à mão, "Usamos seu contato só para avisar da abertura"): não existe fluxo de lista de espera de lojista; o fundador anota. LGPD: finalidade, base legal e onde o papel/planilha fica (F7 da v1) | Lojista s7 | Fundador confirmar como guarda; ajustar a frase de 24 px se for diferente |
| V9 | Contatos em `src/config.json` (WhatsApp, site, e-mail vazios; `@webag` e "Yago" assumidos). Vazio vira linha para escrever à mão; no s14 do lojista o WhatsApp vira `(__) _____-____` | Lojista s7 e s14; Cliente s8 | Fundador preencher |
| V10 | "Pause com um toque", "Importe por planilha", "O painel avisa com som": existem no painel (capturas 21 e 20; som exige ativar no navegador) | Lojista s11 e s12 | Nada; só conferir se o texto "com som" cabe depois do primeiro acesso |
| V11 | Categorias: o cliente não cita "beleza" nem lista categorias (a captura 01 mostra Mercado, Farmácia, Pet, Casa e construção). Não aparece nenhuma promessa de variedade além de "loja" | Cliente | Se o fundador quiser "moda, casa e mais" de volta, só entra com loja de moda ativa |

## V2.2 Capturas (o que usei e o que está errado nelas)

Fonte: `docs/telas/` (2026-11-20, 1x: 390x844 e 1440x900). **`docs/marketing/src/capturas/` ainda não existe**; usei `docs/telas` e deixei um único ponto de troca: `var CAP_BASE = "../../telas/"` no `<script>` do fim de cada HTML (mesmos nomes de arquivo). Se a captura nova tiver outro nome ou outro layout, ajustar os `data-cap` e recalibrar os `.patch` e `.ring`.

| # | Observação | Efeito |
|---|---|---|
| K1 | **Resolução 1x ampliada 2x a 3x** (cartão do pedido 2,5x; botão "Pronto para coleta" 2,95x). Texto da UI fica macio, legível mas sem a nitidez de uma captura 2x | O CEO decide no primeiro render; com captura 2x o HTML não muda (o tamanho é em px do slide, não da imagem) |
| K2 | Dados de seed com **alimento** (banana, pão, bolo de fubá, suco) nas capturas 20, 21 (e 25 vem de vendas de mercadinho) contradizem "bens de consumo, não comida" | Cobri o nome do produto no cartão do pedido (s4). Produtos (s11) e Financeiro (s14) mostram o seed. **Pedir ao mobile-dev capturas com loja de moda/casa** (peça de roupa, vaso, tênis) e valores redondos |
| K3 | Loja do app (04) é "Farmácia Saúde Já" (perfume na capa), não uma loja "que você gosta"; o início (01) mostra "Francisco Mor…" e a faixa "Entrega pelo Webag" | Cliente s4 e s7. Mesma recomendação K2 |
| K4 | Horário estimado de captura de madrugada ("03:06 – 03:31", "03:31 – 04:01") lê como prazo prometido (regra 7 da direção criativa) | Cobri com "Veja no app" (cliente s4 e s5). Remover os `.patch` quando a captura vier em horário comercial **e** o jurídico aceitar faixa de tempo em imagem |
| K5 | Pedido novo da captura 20 mostra "há 19 min" e "Som desligado" (BFF sem tempo real no ambiente de captura) | Recortei só o cartão, cobri a idade com "Novo". "Pago no app" aparece pequeno no cartão (fato, não argumento) |
| K6 | Captura 25 (financeiro) mostra "Vendas R$ 59,90" e "Você recebe R$ 50,90" de seed | Rotulado só pelo contexto; se imprimir, vale um selo "exemplo" ou captura com valores redondos |

## V2.4 Mudanças da v2.1 e o que o fundador liga (2026-11-22)

| # | O que mudou / o que fica pendente | Onde |
|---|---|---|
| V12 | **Flags em `src/config.json`** (`"flags": {"semMensalidade": false, "trocaNoPainel": false}`; o HTML tem o mesmo fallback embutido). Com `false` o PDF **não** mostra "Sem mensalidade" (lojista s5) nem "Troca? Organizada no painel" (lojista s6; no lugar entra "Como vejo o que ganhei? Extrato no painel."). **O fundador liga cada flag para `true` quando confirmar por escrito** (V1: mensalidade; a troca só quando o painel tratar troca, J2). Regerar o PDF depois | `config.json`; lojista s5 e s6 |
| V13 | Cliente: **cortados** "Compre com tranquilidade" (troca + cartão), os cartões de lojas de aplicativos "Em breve" e toda menção a pagamento/cartão. V6 (J2, J3) deixa de valer para o cliente; vale só para a flag `trocaNoPainel` do lojista | Cliente |
| V14 | Ganchos reordenados: lojista abre pelo WhatsApp ("Só retirando, tá?") e a capa "Venda além da sua rua." é o slide 2; cliente abre por "Aquela loja que você adora. Não entrega." e vira em "Agora ela entrega." (slide 2). **As frases que dependem do parecer jurídico J8/DEC-039 continuam e continuam bloqueando a impressão e o envio**: lojista s3 ("Você separa. O Webag leva.") e s13 ("O motoboy do Webag busca na loja"); cliente s2 ("Agora ela entrega.", "No app, até a sua porta.") e s4 ("Saiu para entrega", "Aviso a cada etapa."); o cartão do slide 3 do cliente mostra "Taxa de entrega R$ 8,00" (exemplo). A marcação não vai impressa: segurar a impressão até o parecer | Lojista s3, s13; cliente s2 a s4 |
| V15 | **Cartões desenhados (rótulo "Exemplo")** no lugar das capturas com seed: lojista s4 (pedido novo), s11 (produtos), s13 (pronto para coleta), s14 (financeiro); cliente s3 (loja) e s4 (linha do tempo). Loja de moda e casa, valores redondos (R$ 59,00, R$ 129,00, R$ 188,00; financeiro R$ 1.000, comissão 15%, tarifa até R$ 50, recebe cerca de R$ 800, coerente com o slide 5). Sem código de pedido, sem horário, sem "Pago no app", sem comida, sem nota. **São réplicas do layout real, não capturas: quando o mobile-dev entregar `src/capturas/` em 2x (ainda não existe), trocar** (`CAP_BASE` no fim de cada HTML continua pronto; o histórico do git guarda os recortes e `.ring` calibrados). Só o slide 9 do lojista (cadastro, sem seed) ainda usa captura de `docs/telas` | Lojista s4, s9, s11, s13, s14; cliente s3, s4 |
| V16 | CTA: lojista s7 e s14 com uma ação. **Com `whatsapp` preenchido**: "Mande “quero entrar” no WhatsApp." (s7) e "Pronto para começar? Mande “quero entrar” no WhatsApp:" + número (s14). **Sem número**: "Escreva ao lado. O Yago chama você." (s7), linhas para escrever à mão mantidas e `(__) _____-____` no s14. E-mail só aparece se preenchido. Cliente s5: ação única "Siga @webag no Instagram." (o handle é o provisório do config; IF1/V9: confirmar o usuário real antes de enviar); WhatsApp fica como linha à mão se vazio; site e e-mail só se preenchidos | Lojista s7, s14; cliente s5 |
| V17 | Nova frase no s7 do lojista: **"Estou montando o Webag."** sob "Fale com o Yago" (responde "quem são vocês?"). É afirmação do próprio fundador: confirmar que ele concorda. Foto dele no slide continua opcional (IF6) | Lojista s7 |
| V18 | Nenhum texto abaixo de 32 px agora (as notas legais de 24 px subiram para 32; a do exemplo de venda foi encurtada). "Cerca de 10 min" (cadastro, `[HIPÓTESE]`) e "10 minutos para aceitar" (V4) seguem | Todos |
| V19 | **Não renderizado** (sem Bash). Riscos de quebra de linha para o primeiro render: lojista s6 (quadrante "O cliente / retira / na loja." a 104 px, 3 linhas), s7 (coluna da direita em fluxo, 2 linhas a 56 px em cada bloco), s13 (botão "Pronto para coleta" 40 px em 450 px), s14 (linhas do extrato a 36 px em 692 px); cliente s3 (nome a 48 px) e s4 ("Saiu para entrega" a 72 px, nowrap, em 741 px). Se estourar, devolver o quadro | Todos |

## V2.3 Foto real (opcional) e técnico

- **Foto de fachada** no slide 1 do lojista: bloco diagonal da direita, `id="foto-slot"`. Instrução no comentário do topo do HTML. Sem foto, vale a ilustração `assets/fachada-loja.svg` (a mesma aparece no slide 2 do cliente). Foto de loja de terceiro exige autorização de imagem do dono.
- Arquivos novos em `src/assets/`: `fachada-loja.svg`, `etapa-separando.svg`, `etapa-entregue.svg` (cópias do kit, fundo noite). `etapa-a-caminho.svg` já existia.
- Render: sem Bash, **não renderizei**. Larguras de título foram calculadas com a métrica estimada da Bricolage 800 (~0,54 em por caractere, tracking -0,035 em) com folga de 8 a 20%. Maior risco de quebra de linha: lojista s3 ("O Webag" a 184 px, `nowrap`, termina em ~1840 px), s2 (frase final a 80 px, 1555 de 1680 px), cliente s6 (texto da direita a 80 px, 3 linhas). Se estourar, devolva o quadro que eu ajusto.
- Contrato técnico mantido: `<meta name="marketing-slides">` (14 e 8), `data-ready` (agora também espera as capturas), `config.json` com fallback embutido, tudo que sangra fica em `.clip`/`.shot` (overflow:hidden). Não há texto abaixo de 32 px, exceto as notas de 24 px (exemplo de venda; lista de abertura).

# v1 (obsoleto, só histórico). Pendências das apresentações de 2026-11-20

Peças da v1: 14 e 10 slides, substituídas pela v2 acima. Autor: product-designer. Data: 2026-11-20.
Regra de leitura: nada aqui é fato de produto até alguém fechar o item. `[HIPÓTESE]` = não validado.

## 1. Depende do fundador

| # | Item | Onde aparece | O que decidir |
|---|---|---|---|
| F1 | Aprovar as taglines L2 ("Venda para mais clientes. A entrega é com o Webag.") e C2 (cliente) | Capas das duas peças | `posicionamento.md` §9 ainda lista como pendente |
| F2 | **"Beleza" saiu da copy do cliente.** O posicionamento manda "moda, beleza, casa e mais", mas a lista de categorias do app (captura 02-app-busca) é Mercado, Farmácia, Pet, Casa e construção, Moda e calçados, Eletrônicos, Papelaria, Brinquedos. Sem "beleza" no seed nem em outro documento. Usei "Moda, casa e mais" | Cliente: capa e slide 3 | Confirmar as categorias do dia do lançamento. Se "beleza" existir, trocar o texto nos 2 lugares |
| F3 | "Sem mensalidade" **omitido**. Só existe em DEC-008 (mensalidade como alternativa rejeitada) e nos decks antigos; não está no brief nem em `regras-de-negocio.md` | Lojista: slide 5 | Se o fundador confirmar por escrito, o texto do cartão 4 vira "Sem mensalidade. Comissão só quando vende" |
| F4 | Comissão de 15% é valor de exemplo (HIP-C01) | Lojista: slides 6 e 13 | Confirmar o padrão ou trocar o exemplo |
| F5 | Contatos: WhatsApp, site e e-mail vazios no `config.json`; Instagram `@webag` e nome "Yago" assumidos | Último slide de cada peça | Preencher `src/config.json` (ou o render injeta). Vazio vira linha para escrever à mão |
| F6 | O lojista usa **painel web** (celular ou computador); o app nativo do lojista está fora da 1.0 (`prd/lojista.md`, "Fora do escopo"). A peça diz "painel". CLAUDE.md fala em app do lojista | Lojista: slides 7 a 12 | Confirmar a mensagem "painel" |
| F7 | Passo "Deixe seu contato com o Webag": assume que o fundador anota o contato e avisa quando o cadastro abrir. Não existe lista de espera de lojista pronta como fluxo | Lojista: slide 14 | Confirmar como o contato é guardado (LGPD: finalidade, consentimento) |
| F8 | Selos oficiais Google Play e App Store **não usados** (caixas simples "Em breve") | Cliente: slide 9 | Usar os selos oficiais só depois da publicação (G5) |

## 2. Depende do jurídico

| # | Item | Onde aparece | Risco |
|---|---|---|---|
| J1 | "O motoboy do Webag busca na loja" e "Entrega pelo Webag" (parecer sobre motoboys, DEC-039, J8). Nenhuma peça externa sai antes do parecer e do G5 | Lojista: slides 1, 4, 5, 11. Cliente: slides 1 a 3 | Alto: trava a distribuição |
| J2 | "Peça a troca pelo app" (uma linha, sem prazo nem condição) | Cliente: slide 8. Lojista: slide 12 | Oferta divulgada vincula (CDC art. 30; J5 em `legal/`) |
| J3 | "Não guardamos dados do cartão" (afirmação de fato do produto; confirmar a redação) | Cliente: slide 8 | Baixo |
| J4 | Documentos exigidos por tipo de loja (CPF: RG ou CNH e comprovante; CNPJ: cartão CNPJ e documento do responsável). `prd/lojista.md` marca "revisão jurídica" | Lojista: slide 7 | Médio |
| J5 | Exemplo de valores ao lojista ("cerca de", estimativa) como material de venda | Lojista: slide 6 | Médio: pode ser lido como proposta |
| J6 | "A taxa de entrega é paga pelo cliente. Você não paga frete" (texto do painel, WB-057 C2) | Lojista: slides 6 e 13 | Médio: depende do modelo de logística |

## 3. Hipóteses e números que não são fato fechado

| # | Texto na peça | Origem | Estado |
|---|---|---|---|
| H1 | "10 minutos para aceitar o pedido"; "sem resposta, cancelado e o cliente recebe o dinheiro de volta" | HIP-008, `loja_aceite_timeout_min`; `prd/lojista.md` WB-067 C4 | `[HIPÓTESE]` editável no admin. Pedido do CEO incluiu |
| H2 | Tarifa do Mercado Pago "até R$ 4,98" (4,98% no cartão; PIX 0,99%) | HIP-C02, `relatorio-final.md` (d) item 2 | `[HIPÓTESE]` conferir no contrato do MP |
| H3 | "Você recebe cerca de R$ 80,02" = 100 − 15 − 4,98 (usa a tarifa mais cara, como o painel; DEC-074e) | Cálculo sobre H2 e F4 | Exemplo ilustrativo, rotulado no slide |
| H4 | "Pagamento direto na sua conta" | Posicionamento §5.2. Depende de split do Mercado Pago em produção e KYC (`relatorio-final.md` (c) item 9). Se cair no modo centralizado (ADR), o texto muda | `[HIPÓTESE]` |
| H5 | Dores do lojista (alcance curto, entrega complicada, cobrança manual) | Persona P2 (`personas.md`, perfil já marcado `[HIPÓTESE]`) | Validar nas primeiras conversas. Sem números |
| H6 | "Sua loja aparece para quem busca no app" (mais clientes) | Posicionamento §5.2: sem número até o piloto | Sem promessa de volume |
| H7 | Prazo de análise da loja (2 dias úteis, HIP-030) | Existe no painel, mas **não entrou na peça**: é prazo | Decidir se entra |
| H8 | "PIX ou cartão" sem "em segundos", sem "3x", sem desconto no PIX | Posicionamento §5.1, cuidado do item 3 | Conforme regra |
| H9 | Troca e entrega sem prazo nem garantia em toda a peça | Regras do CEO | Conforme regra |

## 4. Sobre as capturas (`docs/telas/`, 2026-11-20)

| # | Observação | O que fiz | O que falta |
|---|---|---|---|
| C1 | São dados de seed (lojas e nomes fictícios). Os painéis mostram "Mercadinho Boa Compra" | Rotulei como ilustrativo no arquivo; não aparece e-mail nem credencial | Idealmente regerar com loja de demonstração neutra |
| C2 | Captura 01 (Início do app) tem "Lojas perto de você" (copy marcada para sair, `posicionamento.md` §7) | **Não usei** a captura 01 | Regerar depois da nova copy |
| C3 | Capturas 03, 05 e 06 têm artes de produto com degradê (placeholder sem foto) e a 04 mostra "20% off" e "Retire grátis" | **Não usei** nas peças do cliente. A 04 aparece só na peça do lojista (promoção é recurso da loja) | Regerar com fotos reais |
| C4 | CPF mascarado, endereço e WhatsApp fictícios na revisão do cadastro (28) | Recortei acima do endereço e do WhatsApp e cobri o final do CPF | n/a |
| C5 | Captura 20 mostra "Som desligado", atrasos em vermelho e "há 18 min" no pedido novo | Recortei só a coluna do pedido novo e cobri a idade do pedido (ela contradiz o prazo de 10 min). Crop da coluna "pronto para coleta" começa abaixo da idade | n/a |
| C6 | Captura 23: texto "(demonstração)" | Cobri o trecho | n/a |
| C7 | Captura 09 (PIX) mostra o código copia e cola de teste | Cobri a linha do código com a legenda "Código copia e cola" | n/a |
| C8 | Capturas mostram o tempo estimado do app ("Chega entre 03:06 – 03:31", "03:31 – 04:01", "34 a 64 min"): dados de captura de madrugada, leem como promessa de prazo | Cobri com bloco sólido ("Veja no app") a faixa da loja (04, lojista slide 3 e cliente slide 4), a faixa grande do acompanhamento (11, cliente slide 7) e o "00:51" da linha do tempo. **Não cobri** "Chega em 34 a 64 min" na captura 07 (cliente slide 5): o slide existe para mostrar que o app informa o tempo antes de pagar | **Refazer `docs/telas/` em horário comercial** (o mobile-dev pode regerar às 14h, com `deviceScaleFactor: 2`) e remover os blocos de cobertura (`.patch` com "Veja no app") das duas peças. Confirmar com o jurídico se faixa de tempo em imagem conta como promessa (J1) |
| C9 | 2026-11-20, pós-render: a captura 04 (loja) aparece só cortada acima de "Destaques" (celular sangra pela base do slide), então "20% off", "Em oferta" e o degradê não entram em nenhuma peça. O chip "Retire grátis na loja: Avenida Exemplo..." continua visível (endereço de seed) | Lojista slide 3 e cliente slide 4 | Regerar com loja de demonstração neutra e endereço real de exemplo |
| C10 | Lojista slide 8 agora mostra só o cartão "Confira e envie" (28, desktop), sem a faixa roxa e sem o logo. CPF coberto com pontos; WhatsApp e endereço ficam fora do recorte | Lojista slide 8 | n/a |

## 5. Técnico (para o CEO e o render)

| # | Item |
|---|---|
| T1 | **PNGs não copiados para `src/assets/`** (sem Bash). Os HTML apontam para `../../telas/` (relativo, funciona em `file://`). Para ficar autônomo: `mkdir -p docs/marketing/src/assets/telas && cp docs/telas/{02,04,07,09,11,14}-app-*.png docs/telas/{20,22,23,25,27,28}-lojista-*.png docs/marketing/src/assets/telas/` e `sed -i 's#\.\./\.\./telas/#assets/telas/#g' docs/marketing/src/*.html` |
| T2 | Fonte Bricolage está em `docs/design/recursos/fontes/` (não em `docs/design/fonts/`, que só tem Figtree e Fredoka). O `base.css` aponta para os dois lugares |
| T3 | Sob `file://`, o navegador bloqueia `fetch("config.json")`; vale o fallback embutido no HTML (mesmos valores do JSON). Para editar o contato abrindo por `file://`, use o render (que injeta `window.__CONFIG`) ou sirva por http |
| T4 | O HTML marca `<html data-ready="1">` quando fontes e config terminaram. O render deve esperar esse atributo antes de imprimir |
| T5 | Na tela, o CSS reduz o zoom se a janela tem menos de 1920 px. Com `?render` na URL, ou janela >= 1920, nada muda. No PDF (print) nunca se aplica |
| T6 | Contraste: branco sobre o roxo da marca é 4,29:1 e só vale para texto grande. Na peça, todo texto sobre roxo tem >= 30 px e peso >= 600. Sobre fundo claro e noite, >= 6:1 |
| T7 | Não rodei render: a conferência de caber e de quebra de linha foi por cálculo. Primeiro render pode pedir ajuste fino de `top` em poucos blocos (lojista slides 8, 10 e 13) |

---

# Pendências do Instagram e do vídeo de 15 s (v2, refeita em 2026-11-22)

Peças: `src/instagram/{perfil,post-0-apresentacao,post-1,post-2,post-3}.html`, `src/video-story.html`, `src/social.css`. Textos: `instagram-legendas.md`, `video-roteiro.md`, `revisao-social-v2.md`. Autor: product-designer. `[HIPÓTESE]` = não validado. Os itens da v1 (2026-11-20) foram substituídos por esta lista.

## I. Técnico (bloqueia o primeiro render)

| # | Item | O que fazer |
|---|---|---|
| I1 | **Clipes do app ainda não existem** (`src/clips/` ausente em 2026-11-22). O vídeo espera `painel-pedido-novo`, `app-loja`, `app-sacola`, `app-acompanhar` (`.mp4`, e `.webm` de reserva). Sem eles o `<video>` mostra a captura estática e o render sai com nota 3 (`revisao-social-v2.md`) | Mobile-dev grava conforme `video-roteiro.md` §5 (viewport vertical 390x844, 30 fps, pedido "agora", loja de moda, sem prazo). Depois rodar `window.__clipInfo()` no console, ajustar `inn` na tabela `SEG` do `video-story.html` e conferir o `README` dos clipes (eu assumi vertical 390x844) |
| I2 | **O render deve aguardar a Promise de `setTime(t)`** (vídeo) e `window.__ready`. `setTime` agora devolve Promise que resolve após o `seeked` de cada `<video>` ativo + 2 quadros de pintura (teto 3 s). Chromium do Playwright costuma vir **sem H.264**: se os clipes não tocarem, gravar também `.webm` (já há `<source>` de reserva) ou usar Chrome instalado | CEO/dev do pipeline |
| I3 | **O servidor do render só serve `src/`** (`scripts/marketing-render.mjs`, `startServer`: caminho fora de `src` dá 403/404). Dependem de fora de `src/`: as `@font-face` (`../../design/...`) e duas telas (`docs/telas/06-app-sacola.png` poster do vídeo; `docs/telas/20-lojista-pedidos-novos-mobile.png` no post 2 e poster do vídeo) | Opção A: servir `docs/` como raiz. Opção B: `cp docs/telas/{06-app-sacola,20-lojista-pedidos-novos-mobile}.png docs/marketing/src/assets-social/` e trocar os 3 `src` (post 2, 2 posters no `CLIPS`); fontes para `src/assets-social/fonts/` |
| I4 | Usadas em `src/assets-social/` (existem): `01-app-inicio.png` (post 0), `11-app-acompanhamento.png` (post 1, poster do vídeo), `04-app-loja.png` (poster). `09-app-pix.png` **não é mais usada** (PIX saiu das peças) | Pode remover do kit |
| I5 | **Não renderizei.** Larguras com 0,50 em/caractere; linhas de risco em `revisao-social-v2.md` §5 | Devolva o quadro que estourar; ajusto o `font-size` |
| I6 | Capturas em `deviceScaleFactor: 1` (390x844) ampliadas 2,3 a 2,5x (posts) e 2,77x (vídeo): texto da tela fica macio. Seed com "Banana prata" e "Mercadinho Boa Compra" | Regerar `docs/telas/` com `deviceScaleFactor: 2` e loja de moda/casa de demonstração (pendências C1 a C3). Os recortes são proporcionais: nenhum HTML muda |

## II. Depende do fundador

| # | Item | Onde aparece |
|---|---|---|
| IF1 | **Usuário (handle) do Instagram** e **link da bio** (site/WhatsApp). `config.json` tem `@webag` como valor provisório; as peças não mostram o handle de propósito (o CTA é "Siga esta página") | Bio, perfil |
| IF2 | **Trilha do vídeo**: escolher na biblioteca de áudio do Instagram (ver `video-roteiro.md` §6: 120 BPM, instrumental, batida seca, começar na batida 1). Conferir se a conta comercial acessa o catálogo `[HIPÓTESE]` | Vídeo |
| IF3 | **Data de lançamento: não existe e nenhuma peça cita.** Se o fundador fixar a data, entra o adesivo de contagem do Stories e muda a cena 10 do vídeo e o post 3 | Vídeo, post 3 |
| IF4 | Aprovar a **promessa** "Aquela loja que você gosta agora entrega." (post 0, bio, cenas 8 e 9 do vídeo). Substitui a assinatura "Escolha no app. Receba em casa." da v1 | Perfil, post 0, vídeo |
| IF5 | Aprovar **"Tem loja? Venda além da sua rua."** e decidir o que dizer sobre custo ("comissão só quando vende", "sem mensalidade", percentual): a legenda do post 2 **não** afirma nada até a decisão (`direcao-criativa.md` §3) | Post 2, bio |
| IF6 | **Fotos reais** (fachada de loja da região, mão com sacola, motoboy) e 5 a 10 s de vídeo vertical do celular: eliminam o ar de demonstração. As peças têm espaço e funcionam sem | Posts 0 e 1, vídeo |
| IF7 | Autorizar a publicação do perfil e dos 4 posts (peça externa; ver IJ1) e **como guardar o contato do lojista** que chamar no direct (finalidade, consentimento, LGPD) | Todas, post 2 |

## III. Depende do jurídico

| # | Item | Risco |
|---|---|---|
| IJ1 | "Agora entrega", "a loja passa aí", "O motoboy leva." e "Saiu para entrega" prometem entrega pelo Webag (J1 acima: parecer sobre motoboys, DEC-039 J8). **Nenhuma peça externa sai antes do parecer e do G5** (`posicionamento.md` §4). Plano B sem entrega: retirada na loja ("Aquela loja que você gosta agora tem pedido pelo app"); me peça a versão | Alto |
| IJ2 | O vídeo usa a loja de demonstração (cenas 2 e 3): se mostrar "20% off" ou "Retire grátis", é oferta divulgada (J2). O aviso "Telas do app em teste." está nas cenas 1 a 7 | Médio |
| IJ3 | O cartão de acompanhamento mostra faixa de horário; no post 1 os recortes a escondem e no vídeo a faixa da cena 7 a cobre (mesma dúvida do C8) | Baixo |

## IV. Observações de produto/design

| # | Item |
|---|---|
| IP1 | Capturas usadas: 01 (só o banner "Entrega pelo Webag", sem "Lojas perto de você" nem categorias), 11 (cartão e linha do tempo, sem horário), 20-mobile (cartão do pedido novo, com a idade coberta) e, como poster do vídeo, 04 e 06. Não usei 03 e 05 (degradê de placeholder) nem 09 (PIX) |
| IP2 | A foto de perfil tem o símbolo 25% maior que a v1 (880 px) e o desenho ~26 px acima do centro geométrico da caixa (centro ótico). O ícone do app usa outro ponto de centro (ver IP2 da v1: ~46 px mais baixo em 1024); vale o dev do ícone rever |
| IP3 | O "em breve" sem data por 3 semanas desgasta. Recomendo decidir a data (ou parar a série no post 3 e silenciar) |
| IP4 | **Texto do push de abertura** ("Abrimos. Aquela loja que você gosta agora entrega.") aparece desenhado no post 3: PO define o texto final. Também confirmar o caminho do "sininho" no Instagram (post 3, legenda) |
| IP5 | Painel: o recorte do post 2 mostra o rótulo "Pago no app" dentro do cartão real. É fato da tela, não argumento; se o fundador quiser zero menção, cubro o chip (1 linha no HTML) |
