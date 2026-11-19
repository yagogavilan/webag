# Avisos de terceiros (Third-party notices)

O Webag usa os componentes de código aberto abaixo. Esta lista espelha a página pública `/licencas` (a tela equivalente no app ainda não existe: ver "Pendências"). Ao adicionar um ícone, uma fonte ou uma biblioteca com atribuição obrigatória, atualize este arquivo, `apps/web/src/lib/licenses.ts` e a tela do app.

## Ícones

### Solar Icon Set (CC BY 4.0)

- Autoria: 480 Design.
- Origem: https://github.com/480-Design/Solar-Icon-Set (também distribuído pelo Iconify: https://icon-sets.iconify.design/solar/).
- Licença: Creative Commons Atribuição 4.0 Internacional, https://creativecommons.org/licenses/by/4.0/.
- Uso: ícones do aplicativo (linear, bold e bold duotone). Foram recortados e recoloridos para o app, sem outra alteração de desenho.
- Atribuição obrigatória: "Solar Icon Set, de 480 Design, licenciado sob CC BY 4.0".

### Tabler Icons (MIT)

- Autoria: Paweł Kuna. Origem: https://github.com/tabler/tabler-icons.
- Uso: logotipo do WhatsApp nos botões de contato.

### Phosphor Icons (MIT)

- Autoria: Phosphor Icons. Origem: https://github.com/phosphor-icons/react.
- Uso: ícones dos painéis web (admin e lojista), pelo pacote `@phosphor-icons/react`. O app declara `phosphor-react-native` mas não importa nenhum ícone dele (dependência sobrando; ver "Pendências" abaixo).

## Fontes (SIL Open Font License 1.1, https://openfontlicense.org)

Conferido em 2026-11-19 contra o repositório `google/fonts` (arquivos `OFL.txt` de cada família) e contra o `LICENSE` dos pacotes.

| Fonte | Copyright | Origem | Onde vai no produto |
|---|---|---|---|
| Bricolage Grotesque | 2022 The Bricolage Grotesque Project Authors | https://github.com/ateliertriay/bricolage | Títulos. Pacotes `@fontsource/bricolage-grotesque` (web) e `@expo-google-fonts/bricolage-grotesque` (app) |
| Figtree | 2022 The Figtree Project Authors | https://github.com/erikdkennedy/figtree | Texto. Pacotes `@fontsource/figtree` (web) e `@expo-google-fonts/figtree` (app) |
| Outfit | 2021 The Outfit Project Authors | https://github.com/Outfitio/Outfit-Fonts | Logotipo e telas antigas do painel. Arquivos `.woff2` em `apps/web/public/fonts/`, com o texto da licença em `apps/web/public/fonts/OFL-Outfit.txt` |
| Fredoka | 2016 The Fredoka Project Authors | https://github.com/hafontia/Fredoka-One (indicada no `OFL.txt` do Google Fonts) | **Não é distribuída com o produto.** Só aparece no conceito de logotipo descartado `docs/design/logo/v3/webag-conceito-c-alvo.svg` (DEC-041). Fica listada por prudência; se o conceito nunca for usado, pode sair da página `/licencas` |

Nenhuma fonte foi modificada. A licença permite uso, incorporação e redistribuição, inclusive comercial, desde que o aviso de copyright seja mantido e a fonte não seja vendida isoladamente. Eventual "Reserved Font Name" só restringe versões modificadas; não modificamos nenhuma.

## Bibliotecas (npm)

A lista completa das dependências de produção, com versão e licença, é **gerada** (não editada à mão) em [`docs/legal/dependencias-npm.md`](docs/legal/dependencias-npm.md) por `pnpm licencas` (`scripts/gerar-licencas.mjs`, que lê `pnpm licenses list --prod --json`). Rode de novo antes de cada release e anexe ao pacote de release. Estado em 2026-11-19: 963 versões de pacotes de produção, 800 MIT, 49 Apache-2.0, 45 ISC, 19 BSD-3-Clause, 13 BSD-2-Clause, 14 BlueOak-1.0.0 e o restante em licenças permissivas ou dados abertos. **Nenhum pacote com copyleft forte (GPL, AGPL, SSPL) em produção.** Cada pacote traz o aviso de copyright em `node_modules/<pacote>/LICENSE`.

### Triagem de licenças das dependências (2026-11-19)

Itens que não são "permissivos puros". Nenhum bloqueia a publicação; os de copyleft fraco só exigem cuidado se alguém modificar ou embutir o componente.

| Pacote (usado por) | Licença | Tipo | Análise | Ação |
|---|---|---|---|---|
| `@img/sharp-libvips-*` (sharp: miniaturas na API, otimização de imagem no Next.js) | LGPL-3.0-or-later | copyleft fraco | Biblioteca libvips ligada dinamicamente, sem modificação, rodando só nos nossos servidores (a API e o web não são distribuídos a terceiros). Não vai dentro do app nem dos painéis no navegador. A obrigação de oferecer o código-fonte da libvips só nasce se distribuirmos a biblioteca | Nenhuma. Se um dia a imagem Docker for distribuída a terceiros, cumprir a LGPL (aviso + link do código-fonte) |
| `lightningcss*` (build do Next.js e do Metro) | MPL-2.0 | copyleft fraco, por arquivo | Ferramenta de build, sem modificação. O MPL só obriga a abrir os arquivos MPL que forem modificados | Nenhuma |
| `sentry` 0.49.0 (dependência de `@sentry/node`, via `@sentry/bundler-plugins`) | FSL-1.1-Apache-2.0 | código aberto com restrição de uso (vira Apache-2.0 após 2 anos) | A licença proíbe usar o software para um serviço que **compita** com o Sentry. Usamos só para enviar erros da nossa API ao Sentry | Nenhuma. Não é copyleft; sinalizado por não ser OSI |
| `caniuse-lite` (browserslist, build) | CC-BY-4.0 | atribuição | Dados de compatibilidade de navegadores; só em ferramentas de build, não vai ao usuário final | Atribuição já presente no pacote; sem ação |
| `node-forge` | BSD-3-Clause **OU** GPL-2.0 | dupla | Escolhemos a BSD-3-Clause | Nenhuma |
| `argparse` | Python-2.0 / PSF-2.0 | permissiva | Licença da PSF, sem copyleft | Nenhuma |
| `@expo-google-fonts/*` | MIT AND OFL-1.1 | permissiva | Código MIT e fonte OFL (ver Fontes) | Nenhuma |

O `pnpm licenses` só enxerga as variantes de binário instaladas na máquina que gerou a lista (Linux x64). Em macOS e Windows os mesmos pacotes aparecem com outros sufixos (`@img/sharp-libvips-darwin-*`, `lightningcss-darwin-*`, `-win32-*`), com as mesmas licenças.

## Pendências (não bloqueiam o servidor; bloqueiam a publicação do app)

| # | Item | Dono | Por quê |
|---|---|---|---|
| 1 | O app não tem a tela "Licenças de código aberto" (Conta > Sobre) que este arquivo e a DEC-055 descrevem. Solar (CC BY 4.0) exige atribuição visível onde os ícones são usados; hoje ela só existe na página web `/licencas` | `mobile-dev` | A solução mais barata é um item "Licenças" que abre `<WEB_PUBLIC_URL>/licencas` (pelo navegador do sistema), sem duplicar a lista no app |
| 2 | `phosphor-react-native` está em `apps/mobile/package.json` e no `tsconfig.json`, mas nenhum arquivo do app o importa | `mobile-dev` | Dependência sem uso: remover (menos superfície e menos licença a declarar) |
| 3 | `apps/web/src/lib/licenses.ts` descreve o Phosphor só como "painéis web" e não cita o texto da licença da Outfit | `mobile-dev` ou `product-designer` | Manter em sincronia com este arquivo (a página `/licencas` é a atribuição pública) |
