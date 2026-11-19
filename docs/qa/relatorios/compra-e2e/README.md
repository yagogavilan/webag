# Compra de ponta a ponta (U8.1), 2026-11-19

Comando: `NODE_PATH=$(npm root -g) node apps/mobile/scripts/web-compra.cjs` (app web via Metro, API real local, provedor `fake`, site na 3001). Viewport 390x844 (viewport, não fullPage).

| Caminho | Passos provados | Resultado |
|---|---|---|
| `entrega-pix` | login (cliente do seed) > loja > produto > Sacola > "Ir para o pagamento" abre o Checkout > endereço > PIX > "Simular pagamento" (servidor aprova) > Pedido confirmado > acompanhar | OK |
| `retirada-pix` | Início em Retirada > loja > produto > Sacola como visitante > criar conta > volta direto ao Checkout (U8.2) > Retirada > PIX > confirmado com código de 4 dígitos > acompanhar | OK |
| `cartao` | login > Checkout > Cartão > página segura do site (cartão de teste aprovado) > espera > Pedido confirmado > acompanhar | OK |

Causa do U8.1: o ramo `pay` de `cart.tsx` só mostrava o aviso `cart.payPending`; `isCheckoutEnabled()` já era `true` em todos os ambientes (DEC-043).

Ressalvas: o selo vermelho no canto das capturas é o LogBox do modo dev do react-native-web (aviso `transform-origin` do `react-native-svg`), não aparece em build de loja. O Mercado Pago real não foi exercitado (sem chaves).
