# Tela: Licenças de código aberto (Conta › Sobre o Webag)   (DEC-055; pré-requisito do G5)

> Autor: product-designer. Data: 2026-11-19. Plataforma: app do cliente (iOS e Android). Base: `onda-6-conformidade.md` CC1 (aba Conta), `direcao-v3.md` (dial baixo: área legal é sóbria). Também vale para a web (§4).
> Marcas: **[M]** = texto de copyright do conhecimento do designer, **conferir no arquivo LICENSE/OFL.txt do pacote** antes do G5; o texto exibido deve ser copiado do arquivo, nunca redigitado.

## 0. Por que existe e o que a licença exige

| Obra | Licença | O que exige de nós | Onde está no app |
|---|---|---|---|
| **Solar Icon Set**, 480 Design | **CC BY 4.0** (DEC-055) | Crédito ao autor, aviso de copyright, nome e link da licença, aviso de isenção de garantia, link para a obra **e dizer que houve alteração** (convertemos em componentes e recolorimos) | `apps/mobile/src/icons/solar-data.ts` |
| **Bricolage Grotesque** | SIL Open Font License 1.1 | Aviso de copyright e o **texto da licença** junto com a fonte; não vender a fonte sozinha; não usar o nome reservado em versão modificada | `@expo-google-fonts/bricolage-grotesque` |
| **Figtree** | SIL OFL 1.1 | Idem | `@expo-google-fonts/figtree` |
| Tabler Icons (só o glifo do WhatsApp, se o app o usar) | MIT | Aviso de copyright e texto da licença | `direcao-v3.md` §4.2 |
| Bibliotecas do app (React Native, Expo e demais dependências) | MIT, Apache 2.0, BSD e outras | Aviso de copyright e texto da licença de cada uma | `package.json` / lockfile |

Fora da lista: **Outfit** (o logotipo é desenhado em curvas e a fonte não vai no app: não há obrigação; crédito opcional abaixo) e **Fredoka** (saiu na v3; se ainda estiver no pacote, retirar do pacote em vez de creditar). `phosphor-react-native` continua no `package.json` sem uso aparente no código: remover, ou ele entra na lista gerada (§2.3). **Tech-lead confirma.**

## 1. Caminho e tela "Sobre o Webag"

- **CC1 Conta** ganha o item **"Sobre o Webag"** no grupo "Privacidade e legal", depois de "Política de privacidade" (ícone Solar `info-circle` linear). A linha "Versão 1.0.0 (123)" do fim da Conta passa a viver nesta tela. testID: `account.item-about`.
- **Tela Sobre o Webag** (cabeçalho branco com voltar; título "Sobre o Webag" Bricolage 30):
  1. Símbolo v4a 56 + "Webag" + "Versão 1.0.0 (123)" (`caption`, toque longo copia a versão para o suporte; toast "Versão copiada.").
  2. Lista (ListItem 56): **Termos de uso** · **Política de privacidade** · **Licenças de código aberto**.
  3. Identificação do fornecedor (Decreto 7.962/2013, art. 2º): razão social, CNPJ e endereço da Webag **[o fundador informa; PO valida o texto]**.
- testID: `about.version`, `about.terms`, `about.policy`, `about.licenses`, `about.company`.

## 2. Tela "Licenças de código aberto"

**Objetivo do usuário:** quase nenhum cliente entra aqui; quem entra (revisor das lojas, desenvolvedor, jurídico) precisa achar o crédito e o texto completo em 2 toques.

### 2.1 Layout (de cima para baixo)
1. Cabeçalho branco: voltar · título "Licenças de código aberto" (Bricolage 30/800, 2 linhas no celular estreito).
2. Texto (16/24 `text.secondary`): "O Webag usa trabalhos de outras pessoas, liberados para uso. Aqui estão os créditos e as licenças."
3. **Seção "Ícones"** (título 20/700 Figtree):
   - Cartão (raio 22, `neutral.100`, sem sombra): **Solar Icon Set** · "Por 480 Design" · "Licença Creative Commons Atribuição 4.0 Internacional (CC BY 4.0)" · "Alterações: os ícones foram convertidos em componentes do app e recoloridos." · links "Ver licença" (`https://creativecommons.org/licenses/by/4.0/deed.pt-br`) e "Ver o projeto" (endereço oficial do Solar **[confirmar a URL canônica no pacote]**). Abaixo, o aviso de isenção em `caption`: "A obra é oferecida como está, sem garantias. Veja a licença para os detalhes."
   - Se usado: **Tabler Icons** (logotipo do WhatsApp) · "Copyright (c) 2020-2024 Paweł Kuna" **[M]** · "Licença MIT" · "Ver licença".
4. **Seção "Fontes"**:
   - **Bricolage Grotesque** · "Copyright 2022 The Bricolage Grotesque Project Authors (github.com/ateliertriay/bricolage)" **[M]** · "SIL Open Font License 1.1" · "Ver licença".
   - **Figtree** · "Copyright 2022 The Figtree Project Authors (github.com/erikdkennedy/figtree)" **[M]** · "SIL Open Font License 1.1" · "Ver licença".
   - Linha opcional: "O logotipo do Webag foi desenhado a partir da fonte Outfit (SIL Open Font License 1.1)."
5. **Seção "Bibliotecas"**: lista gerada no build (§2.3), ordem alfabética, ListItem 56: nome em `bodyStrong` + "versão · licença" em `caption` + seta. Com mais de 20 itens, campo "Buscar biblioteca" no topo da seção.
6. Rodapé (`caption`): "Lista gerada na versão 1.0.0 (123)."

### 2.2 Detalhe da licença (tela empilhada)
Título = nome da obra; bloco com o **texto integral** da licença e o aviso de copyright exatamente como no arquivo do pacote (fonte do sistema monoespaçada não é necessária; Figtree 14/22, rolagem); botão secundário "Abrir no navegador" quando houver link oficial. Texto selecionável e copiável. testID: `license-detail.title`, `license-detail.text`, `license-detail.open-link`.

### 2.3 Origem dos dados (para o `mobile-dev` e o `tech-lead`)
- Ícones e fontes: arquivo estático versionado (`apps/mobile/src/legal/credits.ts` ou JSON) com nome, autor, licença, alterações e **texto completo** copiado do LICENSE/OFL.txt do pacote.
- Bibliotecas: JSON **gerado no build** a partir das dependências de produção (nome, versão, licença, texto), por script no CI **[HIPÓTESE: ferramenta a escolher pelo tech-lead; sem custo]**. O build falha se aparecer dependência sem licença identificada.
- O mesmo conteúdo alimenta o `THIRD_PARTY_NOTICES.md` da raiz (DEC-055).

### 2.4 Interações
Tocar num cartão ou linha abre o detalhe. "Ver licença"/"Abrir no navegador" abre o navegador do sistema (`expo-web-browser`), não um WebView interno. Voltar do Android e gesto do iOS voltam um nível.

### 2.5 Estados
| Estado | Comportamento |
|---|---|
| Carregando | Não há: o conteúdo é local, abre na hora |
| Vazio | Não se aplica (a lista nunca é vazia; se o JSON gerado faltar, o build falha) |
| Sem conexão | Tudo funciona; ao tocar em link externo: toast "Sem conexão. O texto da licença está aqui mesmo." |
| Erro ao abrir link | Folha "Não conseguimos abrir o link." com o endereço visível e "Copiar endereço" (toast "Endereço copiado.") |
| Busca sem resultado | "Nenhuma biblioteca com esse nome." |

### 2.6 Acessibilidade
Ordem de leitura: título, texto, seções na ordem. Cada cartão é um botão com rótulo completo ("Solar Icon Set, por 480 Design, licença CC BY 4.0, abrir detalhes"). Links com texto que diz o destino. Contraste: texto secundário `neutral.600` 6,9:1 sobre papel. Fonte a 200%: cartões crescem; nenhum texto truncado. Alvo ≥ 44/48.

### 2.7 Android x iOS
Sem diferença de conteúdo. iOS: título grande que recolhe ao rolar (padrão da plataforma); Android: título fixo.

### 2.8 Eventos
Nenhum. Tela legal, sem valor de produto; evita dado desnecessário (LGPD, minimização).

## 3. Microcopy final

| Chave | Texto |
|---|---|
| `about.item` / `about.title` | Sobre o Webag |
| `about.version` / `about.versionCopied` | Versão {versao} ({build}) · Versão copiada. |
| `licenses.title` / `.intro` | Licenças de código aberto · O Webag usa trabalhos de outras pessoas, liberados para uso. Aqui estão os créditos e as licenças. |
| `licenses.icons` / `.fonts` / `.libs` | Ícones · Fontes · Bibliotecas |
| `licenses.solar.by` / `.license` / `.changes` / `.warranty` | Por 480 Design · Licença Creative Commons Atribuição 4.0 Internacional (CC BY 4.0) · Alterações: os ícones foram convertidos em componentes do app e recoloridos. · A obra é oferecida como está, sem garantias. Veja a licença para os detalhes. |
| `licenses.viewLicense` / `.viewProject` / `.openBrowser` | Ver licença · Ver o projeto · Abrir no navegador |
| `licenses.logoNote` | O logotipo do Webag foi desenhado a partir da fonte Outfit (SIL Open Font License 1.1). |
| `licenses.searchLib` / `.noLib` | Buscar biblioteca · Nenhuma biblioteca com esse nome. |
| `licenses.generated` | Lista gerada na versão {versao} ({build}). |
| `licenses.offline` / `.linkError` / `.copyLink` / `.linkCopied` | Sem conexão. O texto da licença está aqui mesmo. · Não conseguimos abrir o link. · Copiar endereço · Endereço copiado. |

testID da lista: `licenses.screen`, `licenses.solar`, `licenses.tabler`, `licenses.font-bricolage`, `licenses.font-figtree`, `licenses.lib-<nome>`, `licenses.search`.

## 4. Web (painéis e landing)

Os painéis v3 também usam Solar (`onda-7-paineis-v3.md` §0) e as mesmas fontes, servidas pela web. Rodapé da folha (lojista e admin) e da landing ganha o link **"Licenças"** para uma página pública `/licencas` com o mesmo conteúdo das §2.1 a §2.2 (seções Ícones, Fontes e Bibliotecas do `apps/web`). Enquanto a web usar Phosphor (MIT), ele entra na lista da web. testID: `public.licenses`.

## Z. Pendências

| # | Item | Quem |
|---|---|---|
| 1 | Conferir textos de copyright **[M]** nos arquivos dos pacotes e a URL canônica do Solar | mobile-dev |
| 2 | Ferramenta de geração da lista de bibliotecas no CI; remover `phosphor-react-native` se não usado; retirar Fredoka do pacote | tech-lead |
| 3 | Razão social, CNPJ e endereço da Webag para "Sobre o Webag" | fundador / PO |
