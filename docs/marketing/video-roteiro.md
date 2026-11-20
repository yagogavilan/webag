# Vídeo de 15 s para Stories: pesquisa, formato, roteiro e storyboard

Autor: product-designer | Data: 2026-11-20 | Peça: `src/video-story.html` (1080x1920, 30 fps, 15 s, sem trilha) | Posts e legendas: `instagram-legendas.md`
Regras que valem aqui: `produto/posicionamento.md` §5 a §7 (promessas permitidas, DEC-040), `design/direcao-v3.md` §4, `design/kit-marca-v3.md`.

## 1. Limite da pesquisa (leia primeiro)

- Pesquisa feita por `WebSearch` em 2026-11-20. O `WebFetch` não resolveu nenhum domínio (rede restrita), então **só li resumos de busca, não as páginas nem os vídeos**. Nenhum vídeo foi assistido por mim.
- A maior parte das fontes sobre "o que viraliza" é blog de agência ou de ferramenta, sem metodologia. Números dessas fontes ficam marcados `[HIPÓTESE]`. Só marco como fato o que tem registro datado e checável (campanha, métrica oficial).
- Consequência: a escolha do formato abaixo é **decisão de design apoiada em padrões repetidos**, não em prova de causa. A prova é o próprio Instagram: ver "Skip Rate" do Stories/Reel depois de publicar (§7).

## 2. Referências (8) e o que extrair de cada uma

| # | Referência | Data | O que é | Extrair para o Webag | Não levar | Evidência |
|---|---|---|---|---|---|---|
| 1 | Duolingo, "Death of Duo". [Fast Company](https://www.fastcompany.com/91313082/duolingo-dead-duo-owl-social-media-campaign), [Meltwater](https://www.meltwater.com/en/blog/duolingo-dead-mascot-campaign), [PR Daily](https://www.prdaily.com/duolingo-shares-pr-secrets-of-viral-death-of-duo-campaign/) | fev/2025 | Teaser em série: uma ideia única, repetida em várias publicações, com começo e fim claros | **Uma ideia só por peça e sequência numerada** (nossa série "1 de 3"). Menções diárias de ~11 mil para ~59,9 mil nos 5 dias após o lançamento (Meltwater); 1,7 bilhão de impressões em 2 semanas (número da própria empresa, não auditado) | Mascote (vetado, DEC-042) e humor mórbido | Fato (campanha e dados de listening); causa do sucesso é opinião |
| 2 | Nothing Phone (3), teaser "New dots". [Smartprix](https://smartprix.com/bytes/nothing-phone-3-teased-with-dot-matrix-display-launch-set-for-july-2025), [Android Central](https://www.androidcentral.com/phones/nothing-phones/nothing-drops-a-glyph-matrix-old-interface-out-teaser) | jun/2025 | Teaser curto que **não mostra o produto inteiro**: um motivo gráfico da marca (pontos) e uma frase de 3 palavras | **Um motivo próprio da marca como protagonista** (nossas 3 barras e a sacola do símbolo) e frase curta | Data no fecho ("Coming July 2025"): aqui é proibido (sem data) | Fato (tagline e data); a leitura do motivo é de imprensa |
| 3 | The Browser Company (Arc), vídeos de lançamento. [Failory](https://newsletter.failory.com/p/lights-camera-arction), [Tella](https://www.tella.com/blog/the-browser-company-video) | 2022 a 2023 | Fundador falando para a webcam, tom de vlog, a **mesma mensagem repetida em várias formulações** | **Repetir a promessa central em formulações diferentes** (nosso "Escolha no app. Receba em casa." no meio e os 3 passos depois) | Rosto/fundador na tela (sem rosto sintético; sem rosto real na primeira rodada) | Comentário de imprensa; sem número de views |
| 4 | Spotify Wrapped. [Alex Jiménez](https://alexjimenezdesign.substack.com/p/three-design-elements-that-made-spotify), [Figures & Figures](https://figuresandfigures.substack.com/p/how-spotify-wrapped-nails-data-storytelling) | 2018 a 2024 | Cartões 9:16, **tipo gigante, cor chapada, um número ou ideia por tela**; o ano de 2021 teria "falhado por fazer demais" | **Tipografia como herói, bloco de cor, um elemento por quadro** (nossos numerais 1, 2, 3 de 640 px e os títulos de 128 px) | Neon, gradiente, volume de efeitos; dados pessoais (não temos) | Comentário de design; formato 9:16 é fato |
| 5 | Contagem regressiva do Instagram Stories. [Metricool](https://metricool.com/instagram-countdown/), [Later](https://later.com/blog/instagram-stories-countdown-sticker) | 2025 a 2026 | Guias dizem que **um teaser isolado rende pouco; vários posts com data e hora rendem mais**; o adesivo manda lembrete a quem toca | **Série repetida** (4 peças em 3 semanas) e **um CTA que vira aviso** | O adesivo de contagem: exige data, e não há data (regra do pedido). Substituto: "Siga e ative as notificações" | Blogs de ferramenta `[HIPÓTESE]` |
| 6 | Reels/Stories para anúncio: som desligado, 9:16, zona segura. [Adobe, 2024-11-04](https://blog.adobe.com/en/publish/2024/11/04/unlock-potential-reels-best-practices-for-creative-success-using-adobe-creative-cloud), [WebsiteBuilderExpert, resumo das dicas da Meta](https://www.websitebuilderexpert.com/news/meta-updates-reels-ads-guide/) | 2024 a 2026 | Recomendação consistente: vertical nativo, legenda/texto grande para quem assiste sem som, nada importante nas faixas da interface | **Texto grande, tudo legível sem som, margens: topo 250 px e base 340 px**. Fontes de agência falam em 14% no topo e 35% na base (28% menos cliques fora da zona) `[HIPÓTESE]`; nosso vídeo usa y de 270 a 1575 | Percentuais exatos como regra; confira no Instagram com o guia de zona segura na hora de publicar | Recomendação consistente, números `[HIPÓTESE]` |
| 7 | Métrica "Skip Rate" do Instagram. [WebsiteBuilderExpert](https://www.websitebuilderexpert.com/news/instagram-reel-retention-chart/), [Opus](https://www.opus.pro/blog/instagram-reels-hook-formulas) | ago/2025 | O Instagram passou a mostrar a % de quem sai **nos 3 primeiros segundos** e um gráfico de retenção | **Gancho dentro de 1,5 s e nada de logo ou abertura de marca antes dele** | Metas numéricas (60%, 80% de retenção): são de fornecedores `[HIPÓTESE]`; a afirmação "texto e movimento nos 2 primeiros segundos elevam a retenção em até 50%" também é de fornecedor `[HIPÓTESE]` | Existência da métrica: fato; benchmarks: `[HIPÓTESE]` |
| 8 | Formato POV (situação em primeira pessoa). [Sendible](https://www.sendible.com/insights/what-does-pov-mean-social-media-marketing), [Brandwatch](https://brandwatch.com/social-media-glossary/pov-video) | 2025 | Põe quem assiste **dentro de uma situação reconhecível**; o rótulo "POV:" é convenção do TikTok e no Reels funciona melhor sem ele; só funciona se a situação for específica e real | **Abrir com uma situação específica, sem rótulo e sem rosto** ("A loja fechou antes de você chegar.") | O rótulo "POV:" e pessoa em cena | Blogs; o 17% de ganho citado em fontes secundárias não foi verificado `[HIPÓTESE]` |

Apoio de estrutura (não contam entre as 8): guias de teaser repetem "tensão, escalada, revelação", teaser de 6 a 15 s e corte a cada 1 a 2 s `[HIPÓTESE]` ([forkoff](https://forkoff.xyz/answers/how-to-make-a-viral-startup-launch-video), [60fps.design](https://mockup.60fps.design/blog/app-launch-video), este último alerta que tela de abertura ou animação de logo gasta os únicos segundos garantidos).

**Padrão que se repete nas 8:** (1) uma ideia por peça; (2) a primeira imagem já é a mensagem; (3) texto grande e cor chapada; (4) revelação do produto real, não ilustração; (5) um único convite no fim. É o que o vídeo faz.

## 3. Formato escolhido: "situação em primeira pessoa + revelação da tela real"

Estrutura: **situação (2 s) → marca (2 s) → 3 passos na tela real (3 x 2 s) → "Em breve" + um CTA (5 s)**.

| Por que este | Evidência/raciocínio |
|---|---|
| Gancho sem produto e sem rosto | O Webag não pode ter rosto sintético nem foto de estoque. Uma frase específica de 5 palavras identifica o público em menos de 1 s (ref. 8, 7) |
| Funciona mudo | Tudo é texto de 128 a 300 px em cor chapada; o som só reforça o ritmo (ref. 4, 6) |
| A prova é real | As telas são capturas do app de verdade dentro de moldura simples. É a resposta direta à exigência "não pode parecer de IA" |
| Não precisa de data | O fecho é "Em breve." mais "Siga para saber quando abrir." (ref. 5, adaptado) |
| Sequência com os posts | O vídeo mostra a mesma tríade dos posts (escolher, pagar, acompanhar) e repete a assinatura C3 do PO |

Descartados e por quê: **contagem regressiva** (exige data); **fundador falando** (sem rosto na 1ª rodada; o fundador pode gravar uma versão depois, ref. 3); **estilo Wrapped com dados** (não há dados de uso); **demo longa de 30 s** (a regra é 15 s e a retenção cai [HIPÓTESE]); **humor com mascote** (vetado).

## 4. Regras de produção

| Item | Regra |
|---|---|
| Palco | 1080x1920, 30 fps, 15 s = 450 quadros. Determinístico: `window.setTime(t)` posiciona tudo; um timeline em JS puro |
| Margem segura | Topo 250 px e base 340 px sem texto (interface do Instagram). Laterais 84 px. Texto de y=270 a y=1575 |
| Tipografia | Bricolage Grotesque 800 (títulos, numerais), Figtree 600 a 800 (adesivos, aviso). Mínimo 32 px (aviso); títulos 128 a 300 px |
| Cor | Roxo `#C02EF0`, noite `#1C1721`, lima `#D6FF4A`, branco. Sem gradiente, sem sombra com desfoque, sem emoji |
| Contraste | Branco sobre roxo 4,29:1 (só texto >= 104 px, passa AA para texto grande); lima sobre noite 15,3:1; noite sobre lima 15,3:1; branco sobre noite 17,6:1. O aviso pequeno ("Telas do app em teste.") fica em caixa noite para dar 17,6:1 também sobre o roxo |
| Movimento | Corte seco entre cenas, sem transição. Dentro da cena: subida de 30 a 60 px com `out3`/`out5` em 0,14 a 0,28 s; barras crescem em 60 ms de intervalo; adesivo salta com `back` curto (sobressalto <= 20%). Nada flutua, nada em loop |
| Tela real | `docs/telas/04-app-loja.png`, `09-app-pix.png`, `11-app-acompanhamento.png`; moldura: retângulo arredondado noite, sem notch |
| Sem trilha | O MP4 sai com silêncio. Trilha: ver §6 |

## 5. Storyboard cena a cena

Compasso: 2,0 s por cena a 120 BPM (4/4). Microeventos em múltiplos de 0,25 s. Para outra trilha, mude só o objeto `T` no topo do script do HTML.

| Tempo | Cena | O que aparece | Texto na tela | Movimento | Transição | Som desejado |
|---|---|---|---|---|---|---|
| 0,00 a 2,00 | **A. Gancho** (fundo noite) | Cartaz tipográfico à esquerda, 5 linhas de 224 px. "fechou" sobre marca-texto lima inclinado | A loja / **fechou** / antes de / você / chegar. | Quadro 0 já mostra "A loja fechou". "antes de" em 0,25, "você" em 0,50, "chegar." em 0,75 (cada uma sobe 34 px em 0,14 s). Resto parado até 2,0 (tempo de leitura) | Entra seco, sem fade de abertura | Kick grave seco em 0,00. Três estalos secos (0,25, 0,50, 0,75) |
| 2,00 a 4,00 | **B. Marca** (fundo roxo) | Logo branco (símbolo + "webag") de 800 px no centro, frase de 104 px abaixo | Escolha no app. / Receba **em casa.** | Corte seco para o roxo. Barras crescem da esquerda em 2,00 / 2,06 / 2,12; sacola salta (0,8 a 1,0) em 2,10; palavra entra da direita em 2,24. Linha 1 em 2,50; linha 2 em 3,00 | Corte seco de noite para roxo | Kick + clap fortes em 2,00 (maior acento do primeiro terço). Três toques curtos nas barras. Estalo em 2,50 e em 3,00 |
| 4,00 a 6,00 | **C. Passo 1** (noite) | Numeral "1" lima de 640 px à esquerda; título 128 px; aparelho à direita com a tela da loja; adesivo | **Escolha a loja.** Adesivo: "Tempo e taxa antes de pedir" | Numeral sobe em 4,00; título em 4,08 e 4,16; aparelho sobe 300 px em 0,28 s (4,12 a 4,40); adesivo salta em 5,00 | Corte seco | Kick + clap em 4,00. Subida curta de ruído (<= 0,3 s) no aparelho. Click grave em 5,00 |
| 6,00 a 8,00 | **D. Passo 2** (roxo) | Igual a C, com a tela do PIX (valor e contador) | **Pague com PIX.** Adesivo: "Confirma sozinho" | Mesmo padrão em 6,00 / 6,08 / 6,16 / 6,12 / 7,00 | Corte seco | Mesmo acento de C em 6,00 e 7,00 |
| 8,00 a 10,00 | **E. Passo 3** (noite) | Igual a C, com a tela de acompanhamento (cartão noite com a faixa de horário) | **Acompanhe até a porta.** Adesivo: "Fale com a loja pelo WhatsApp" | Mesmo padrão em 8,00 / 8,08 / 8,16 / 8,12 / 9,00 | Corte seco | Mesmo acento de C em 8,00 e 9,00 |
| 10,00 a 12,00 | **G1. Em breve** (roxo) | Logo branco pequeno no topo (y 300); "Em" e "breve." de 300 px, "breve." sobre marca-texto lima | Em / **breve.** | "Em" sobe 40 px em 10,00; "breve." salta de 90% a 100% em 10,04 | Corte seco | Acento mais forte do vídeo: kick + sub grave com cauda de ~0,5 s em 10,00 |
| 12,00 a 15,00 | **G2. CTA único** (roxo) | Cartão noite de 912 px com a chamada; sublinhado lima desenha sob a segunda linha | Siga para saber / **quando abrir.** | Cartão sobe 60 px em 12,00 (0,22 s). Sublinhado cresce da esquerda em 12,45 (0,30 s). Parado de 12,75 a 15,00 para a leitura | Sem corte; o cartão entra sobre o fecho | Clap seco em 12,00 e um toque agudo em 12,45. Batida cai de volume (ou filtro passa-baixa) até o fim |
| 4,00 a 10,00 | Camada fixa | Caixa noite pequena na base (y 1534) | Telas do app em teste. | Estática | | |

Primeiro quadro (miniatura/capa): cena A em 0,0 s tem 2 linhas; uma capa melhor é o quadro de 1,50 s (hook completo). Use `--capa 1.5` no render.

## 6. Direção de som (a trilha é escolhida pelo fundador)

| Item | Direção |
|---|---|
| Biblioteca | A do próprio Instagram (livre de direitos para o uso na plataforma). Contas comerciais costumam ter catálogo restrito; confirme na conta do Webag `[HIPÓTESE: não verificado]`. O README de `docs/marketing/` traz as alternativas e o cuidado com licença |
| Tipo de batida | Instrumental, **sem vocal**, batida seca e curta: kick grave, estalo ou clap no 2 e no 4, chimbal fechado em colcheias. Hip hop instrumental, trap leve ou eletrônica mínima. Nada de pad longo, nada de épico, nada de ukulele/"feliz de comercial" |
| Andamento | 120 BPM (aceita 112 a 126). Compasso de 2,0 s: cortes em 0, 2, 4, 6, 8, 10 e CTA em 12. A 100 BPM o compasso é 2,4 s; mude `T` no HTML |
| Início | A faixa precisa **começar na batida 1** (corte o início da música no editor do Instagram); sem fade-in |
| Acentos | Fortes em 0,00, 2,00 e 10,00; médios em 4,00, 6,00, 8,00 e 12,00; pequenos nos microeventos (0,25 / 0,50 / 0,75 / 2,50 / 3,00 / 5,00 / 7,00 / 9,00 / 12,45) |
| Fim | A batida cai de volume entre 12,00 e 15,00 para não competir com a leitura; fade-out no último segundo |
| Volume | Música baixa o bastante para o vídeo ainda ser entendido sem som (ele já é) |

## 7. Como medir (hipótese a validar)

Depois de publicar: ver no Instagram o **Skip Rate** e o gráfico de retenção. Meta de partida `[HIPÓTESE]`: Skip Rate abaixo de 70% e 50% de quem começa chegando em 10 s. Se o Skip Rate for alto, trocar só a cena A (o gancho) e manter o resto: A é a única que precisa ser reescrita (alternativas: "Saiu do trabalho às 19h. A loja fecha às 18h." ou "O presente é pra amanhã e já são 21h.").

## 8. Aceite do pedido

| Critério | Como o vídeo atende |
|---|---|
| Gancho nos primeiros 1,5 s | "A loja fechou" no quadro 0; frase completa em 0,89 s |
| Entendido sem som | Todo conteúdo é texto grande; nenhuma informação depende de áudio |
| Um único CTA | "Siga para saber quando abrir." É a única chamada; "Em breve." é informação, não ação |
| Contraste AA | Ver §4; texto branco sobre roxo só em corpo >= 104 px |
| Consistência com perfil e posts | Mesmas cores, Bricolage + Figtree, símbolo, marca-texto lima, adesivo, tríade escolher/pagar/acompanhar |
| Sem data, sem prazo | Só "Em breve" |
| Não parece IA | Telas reais, tipografia opinativa, grade rígida, cortes secos, movimento curto, sem rosto, mão, gradiente, brilho, partícula ou estoque |

## 9. Riscos e pendências do vídeo

- `[HIPÓTESE]` A situação do gancho (loja fecha antes de o cliente chegar) vem das personas, que não foram validadas (`produto/personas.md`). Testar com 5 moradores antes de impulsionar.
- A cena B repete a assinatura C3 "Escolha no app. Receba em casa." e as telas mostram "entrega Webag": **"Entrega pelo Webag" depende do parecer jurídico** (DEC-039, `posicionamento.md` §4). Publicar só com o parecer, ou trocar a cena B por "Escolha no app. Pague com PIX." (uma linha no HTML).
- As telas vêm do ambiente de demonstração (lojas e valores fictícios). Por isso o aviso "Telas do app em teste." de 4 a 10 s.
- Recapturar `docs/telas/` com `deviceScaleFactor: 2` melhora a nitidez do aparelho no vídeo (hoje ampliado 1,06x; no post 0 também).
