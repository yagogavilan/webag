# Compra de ponta a ponta (U8.1), 2026-11-19

Comando: `NODE_PATH=$(npm root -g) node apps/mobile/scripts/web-compra.cjs [entrega-pix|retirada-pix|cartao]` (app web via Metro `pnpm web`, API real local, provedor `fake`, site `apps/web` na 3001; setup em `docs/qa/relatorios/setup-do-zero.md`). Viewport 390x844 (viewport, não fullPage).

| Caminho | Passos provados | Resultado |
|---|---|---|
| `entrega-pix` | login (cliente do seed) > loja > produto > Sacola > "Ir para o pagamento" abre o Checkout > endereço > PIX > "Simular pagamento" (o servidor aprova) > Pedido confirmado > acompanhar | OK (capturas `entrega-pix-*`). Depende do horário da logística (BUG-016): fora dele a Sacola só oferece "Escolha como receber" e o script marca PULADO |
| `retirada-pix` | Início em Retirada > loja > produto > Sacola como visitante > criar conta > volta direto ao Checkout (U8.2) > Retirada > PIX > confirmado com código de 4 dígitos > acompanhar | OK |
| `cartao` | login > Retirada > Checkout > Cartão > página segura do site (cartão de teste "aprovado") > espera > Pedido confirmado > acompanhar | OK |

Causa do U8.1: o ramo `pay` de `cart.tsx` só mostrava o aviso `cart.payPending`; `isCheckoutEnabled()` já era `true` em todos os ambientes (DEC-043), então não havia flag a ligar.

Ressalvas
- O selo vermelho no canto de algumas capturas é o LogBox do modo dev do react-native-web (aviso `transform-origin` do `react-native-svg`); não existe em build de loja.
- As imagens do armazenamento local (porta 9000) são bloqueadas pelo navegador (ORB) neste ambiente: cartões e banners aparecem cinza. Não afeta o fluxo.
- Mercado Pago real, push real e aparelho físico não foram exercitados. O Maestro (`e2e/comprar-com-pix.yaml`) continua sem execução (sem emulador).
- Os pedidos criados ficam no banco local de desenvolvimento e a sacola do cliente do seed acumula itens entre corridas (o script esvazia a sacola de outra loja quando o app pergunta).

Outras capturas desta onda: `inicio-r2-390x844.png` (U8.3), `lojista-pedidos-*.png` (U8.7: 390x844 com e sem alerta em tela cheia, e 1366x768).
