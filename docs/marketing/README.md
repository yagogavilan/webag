# Marketing: render das peças

`pnpm marketing [alvo]` converte o HTML de `docs/marketing/src/` em PDF, PNG e MP4 em `docs/marketing/saida/` (commitada). Script: `scripts/marketing-render.mjs`.

## Como renderizar

```
pnpm marketing            # tudo (padrão)
pnpm marketing lojista    # saida/apresentacao-lojista.pdf
pnpm marketing cliente    # saida/apresentacao-cliente.pdf
pnpm marketing instagram  # saida/instagram/{perfil,post-0-apresentacao,post-1,post-2,post-3}.png
pnpm marketing video      # saida/video-story-15s.mp4 + saida/video-story-capa.png
```

Opções: `--capa <s>` (frame da capa, padrão 2), `--audio <arquivo>` (trilha), `--ajuda`.
Requisitos: `pnpm install` (usa o Playwright do workspace), Chromium (`pnpm --filter @webag/web exec playwright install chromium`, uma vez) e `ffmpeg`/`ffprobe` no PATH. Já tem um Chromium/Chrome instalado? Aponte com `CHROMIUM_PATH=/caminho/chrome`.
Rodar de novo regera tudo (idempotente: PDF, PNG e MP4 saem byte a byte iguais se o HTML não mudou). Alvo explícito com HTML ausente é erro; em `tudo`, peça ausente é aviso. Código de saída 1 se algo falhar.

Tempos medidos (Linux, CPU comum): PDF ~1 s por apresentação; cada PNG do Instagram ~1,5 s; vídeo de 15 s (450 frames) ~25 s.

## Estrutura

```
docs/marketing/
  src/config.json            contato (nome, whatsapp, instagram, site, email); o HTML lê sozinho via fetch
  src/apresentacao-{lojista,cliente}.html   <section class="slide"> de 1920x1080
  src/instagram/{perfil (1080x1080), post-0-apresentacao, post-1..3 (1080x1350, raiz main.post)}.html
  src/video-story.html       palco 1080x1920; window.__duration e window.setTime(t) determinísticos
  src/base.css, social.css, assets*   compartilhados
  saida/                     resultado commitado
```

Trocar o contato: edite só `src/config.json` e rode `pnpm marketing`.
O pipeline serve `src/` por um servidor HTTP local em porta livre (127.0.0.1, porta escolhida pelo SO), porque `fetch` de JSON não funciona em `file://`. Para ver no navegador sem o pipeline: `npx serve docs/marketing/src` (ou qualquer servidor estático) e abrir a URL.

## O que o pipeline verifica (e falha com mensagem clara)

- Apresentações: cada slide mede exatamente 1920x1080 e não tem overflow (`scrollWidth/Height`); o erro lista o slide (número e título). O PDF tem uma página por slide (1920x1080 px = 1440x810 pt), com fundo e cores impressos e texto vetorial/selecionável (fontes embutidas; o Chromium as grava como Type 3, normal). Atenção: `filter`, `backdrop-filter`, `mix-blend-mode` e sombras grandes são rasterizados pelo Chromium dentro do PDF.
- Todos: aguarda `document.fonts.ready` e a decodificação das imagens; falha em 404 de recurso local, imagem/fonte que não carregou e exceção JS; avisa de recurso externo (as peças devem funcionar offline, então fontes e imagens vão em `src/assets*`).
- Instagram: raiz com o tamanho exato e sem overflow; PNG final conferido (largura x altura) no cabeçalho do arquivo.
- Vídeo: `window.__duration` e `window.setTime` existem; ffprobe confere H.264, yuv420p, 1080x1920, 30 fps e a duração.

## Decisões de render

- **PNG do Instagram**: captura em deviceScaleFactor 2 e redução Lanczos (ffmpeg) para 1080 de largura, saída RGB 8 bits. Num teste lado a lado, o texto ficou praticamente igual ao de DSF 1 (com `--font-render-hinting=none`); o 2x ganha só em bordas de curvas, gradientes e imagens redimensionadas. Custo: ~1 s por peça. O Instagram recomprime tudo em JPEG de qualquer forma.
- **Vídeo**: para cada frame `i`, `setTime(i/30)` + screenshot PNG (sem perda) enviado por pipe ao ffmpeg, sem arquivos temporários. Saída: H.264 High, yuv420p, CRF 16, 30 fps, BT.709, `+faststart`. As animações precisam depender só de `setTime`; animação CSS/JS por relógio real quebra o determinismo.
- **Áudio**: por padrão, faixa AAC de silêncio. O Instagram aceita vídeo sem áudio, mas editores e alguns uploaders (Meta Business Suite, agendadores) tratam melhor um arquivo com a faixa presente, e dá para trocar depois pela música do próprio Instagram. Com `--audio`, a trilha é cortada na duração do vídeo com fade-out de 1 s.
- Chromium com `--font-render-hinting=none` (texto igual em qualquer máquina) e `--force-color-profile=srgb` (cor igual em qualquer monitor).

## Trilha do vídeo

Não há trilha no repositório (nenhuma licença foi adquirida). Opções sem custo, nesta ordem de recomendação:

1. Música da biblioteca do próprio Instagram, adicionada na hora de publicar o story (o vídeo sai com silêncio). Contas comerciais costumam ter o catálogo restrito, então confira na conta do Webag. [HIPÓTESE: não verificado]
2. Arquivo de uso livre baixado de uma biblioteca de áudio (YouTube Audio Library, Pixabay Music, Free Music Archive). Leia a licença de cada faixa (uso comercial, atribuição) e guarde o link da licença em `docs/decisoes.md` ou ao lado do arquivo. Depois: `pnpm marketing video --audio caminho/da-trilha.mp3`.
3. Não use música de artistas comerciais baixada de outros lugares: risco de bloqueio do vídeo e de reclamação de direitos autorais.

O arquivo de áudio não precisa ser commitado (basta o MP4 final); se for, mantenha-o fora de `src/`.
