# Avisos de terceiros (Third-party notices)

O Webag usa os componentes de código aberto abaixo. Esta lista espelha a página pública `/licencas` e a tela "Licenças de código aberto" do app (Conta > Sobre). Ao adicionar um ícone, uma fonte ou uma biblioteca com atribuição obrigatória, atualize este arquivo, `apps/web/src/lib/licenses.ts` e a tela do app.

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
- Uso: ícones dos painéis web (admin e lojista).

## Fontes (SIL Open Font License 1.1, https://openfontlicense.org)

| Fonte | Copyright | Origem |
|---|---|---|
| Bricolage Grotesque | The Bricolage Grotesque Project Authors | https://github.com/ateliertriay/bricolage |
| Figtree | The Figtree Project Authors | https://github.com/erikdkennedy/figtree |
| Outfit | The Outfit Project Authors | https://github.com/Outfitio/Outfit-Fonts |
| Fredoka | The Fredoka Project Authors | https://github.com/hafontia-zz/Fredoka-Font |

As fontes são distribuídas sem modificação, pelos pacotes `@fontsource/*` e `@expo-google-fonts/*`, cada um com o texto completo da licença no arquivo `LICENSE`. A licença permite uso, incorporação e redistribuição, inclusive comercial, desde que o aviso de copyright acima seja mantido e as fontes não sejam vendidas isoladamente.

## Bibliotecas

As dependências npm (React, React Native, Expo, Next.js, NestJS e demais) são distribuídas sob licenças permissivas (MIT, Apache-2.0, BSD, ISC). Cada pacote traz o seu aviso de copyright em `node_modules/<pacote>/LICENSE`. [A fazer antes da publicação: gerar a lista completa com `pnpm licenses list --prod` e anexar ao pacote de release.]
