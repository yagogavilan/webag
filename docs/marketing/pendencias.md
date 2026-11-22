# Pendências das apresentações v2 (lojista e cliente)

Peças: `src/apresentacao-lojista.html` (14 slides: 7 de conversa, 1 divisor, 6 de guia) e `src/apresentacao-cliente.html` (8 slides). Autor: product-designer. Data: 2026-11-22. Revisão por slide: `revisao-decks-v2.md`.
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

# Pendências do Instagram e do vídeo de 15 s

Peças: `src/instagram/{perfil,post-0-apresentacao,post-1,post-2,post-3}.html`, `src/video-story.html`, `src/social.css`. Textos: `instagram-legendas.md`, `video-roteiro.md`. Autor: product-designer. Data: 2026-11-20. `[HIPÓTESE]` = não validado.

## I. Técnico (bloqueia o primeiro render)

| # | Item | O que fazer |
|---|---|---|
| I1 | **PNGs não copiados para `src/assets-social/`** (sem Bash). Os HTML já apontam para lá | `mkdir -p docs/marketing/src/assets-social && cp docs/telas/{01-app-inicio,04-app-loja,09-app-pix,11-app-acompanhamento}.png docs/marketing/src/assets-social/` |
| I2 | **O servidor do render só serve `src/`** (`scripts/marketing-render.mjs`, `startServer`, linhas 152 a 163: caminho fora de `src` dá 403/404). As `@font-face` com `../../design/...` (as minhas e as do `base.css`) viram `/design/...` na URL e dão 404, o que o `openPage` trata como erro. Só funciona em `file://` | Opção A (1 linha de código): servir `docs/` como raiz e abrir `/marketing/src/...`. Opção B (sem mexer no script): copiar as fontes para `src/assets-social/fonts/` e trocar o caminho nas `@font-face` (6 arquivos). Preciso do CEO/dev do pipeline para escolher; eu ajusto o caminho em 5 minutos se for a B |
| I3 | Fontes: **Bricolage está em `docs/design/recursos/fontes/`**, não em `docs/design/fonts/` (que só tem Figtree e Fredoka). Usei o caminho certo de cada uma | Só registro; mesmo achado do T2 acima |
| I4 | Não rodei render. Larguras e quebras foram calculadas com a métrica estimada da Bricolage 800 (~0,55 em por caractere, com tracking -0,045 em). Pontos de maior risco: título do post 0 (156 px), "Vai abrir." do post 3 (196 px), "antes de" e "breve." do vídeo (224 px e 300 px), numerais de 640 px | Se algum estourar, reduzo o `font-size` da linha; me devolva o quadro |
| I5 | Capturas estão em `deviceScaleFactor: 1` (390x844). No vídeo e no post 0 o aparelho amplia 1,06x e o texto da tela fica levemente macio | Regerar `docs/telas/` com `deviceScaleFactor: 2` (2x = 780x1688). Os HTML não mudam |
| I6 | O pipeline mede `scrollHeight` da raiz: o aparelho do post 0 que sai pela base foi recortado numa caixa `.vp` para não contar como overflow | Nada |

## II. Depende do fundador

| # | Item | Onde aparece |
|---|---|---|
| IF1 | **Usuário (handle) do Instagram** e **link da bio** (site/WhatsApp). `config.json` tem `@webag` como valor provisório; as peças não mostram o handle de propósito (o CTA é "Siga esta página") | Bio, perfil |
| IF2 | **Trilha do vídeo**: escolher na biblioteca de áudio do Instagram (ver `video-roteiro.md` §6: 120 BPM, instrumental, batida seca, começar na batida 1). Conferir se a conta comercial acessa o catálogo `[HIPÓTESE]` | Vídeo |
| IF3 | **Data de lançamento: não existe e nenhuma peça cita.** O vídeo e os posts dizem só "Em breve". Se o fundador fixar a data, entra o adesivo de contagem do Stories e muda a cena G | Vídeo, post 3 |
| IF4 | Aprovar a **assinatura** "Escolha no app. Receba em casa." (C3 do PO) usada no post 0, na bio e na cena B do vídeo | Perfil, post 0, vídeo |
| IF5 | Aprovar o **cartaz do post 1** (18h, 19h, 21h): é uma situação das personas, não validada `[HIPÓTESE]` | Post 1, cena A |
| IF6 | Autorizar a publicação do perfil e dos 4 posts (peça externa; ver J1 abaixo) | Todas |

## III. Depende do jurídico

| # | Item | Risco |
|---|---|---|
| IJ1 | "Entrega pelo Webag", "receba em casa" e a tela com "entrega Webag" (J1 acima: parecer sobre motoboys, DEC-039 J8). **Nenhuma peça externa sai antes do parecer e do G5** (`posicionamento.md` §4). Plano B sem entrega: bio e cena B passam a "Escolha no app. Pague com PIX." e o post 0 troca o título; me peça a versão | Alto |
| IJ2 | A tela da loja (captura 04) mostra "20% off", "Em oferta" e "Retire grátis". Oferta divulgada vincula (J2 acima). O rótulo "Telas do app em teste" está no vídeo (4 a 10 s) e no post 2. Se o PO preferir, troco a captura 04 por outra | Médio |
| IJ3 | A captura 11 mostra faixa de horário ("Chega entre 03:06 – 03:31"); é o app como está, sem prazo na copy (mesma dúvida do C8 acima) | Baixo |

## IV. Observações de produto/design

| # | Item |
|---|---|
| IP1 | Usei as capturas 01 (só o topo, antes de "Lojas perto de você"), 04, 09 (com o código copia e cola coberto) e 11. Não usei 03, 05 e 06 (degradê de placeholder). A 01 mostra categorias (Mercado, Farmácia, Pet, Casa e construção): vale o F2 acima, só aparecem as que existirem no lançamento |
| IP2 | A foto de perfil centraliza o conteúdo do símbolo no círculo. O ícone do app (`webag-icone-app-v4.src.svg`) usa o ponto (82; 54,5) como centro e acaba com o desenho ~46 px mais baixo em 1024; para o perfil corrigi, então os dois não são idênticos pixel a pixel. Vale o dev do ícone rever |
| IP3 | O "em breve" sem data por 3 semanas desgasta. Recomendo decidir a data (ou parar a série no post 3 e silenciar) para não manter público esperando sem aviso |
