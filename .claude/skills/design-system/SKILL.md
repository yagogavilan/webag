---
name: design-system
description: Fundamentos do design system e de UX do Webag (tokens, componentes, acessibilidade, microcopy, padrões de marketplace). Use ao desenhar fluxos e telas, definir tokens ou revisar interfaces implementadas.
---

# Tokens (`docs/design/tokens.json`)
Estrutura mínima — fonte única para o app e o admin:
```json
{
  "color": { "brand": {}, "neutral": {}, "feedback": { "success": "", "warning": "", "danger": "", "info": "" }, "surface": {}, "text": {} },
  "font": { "family": {}, "size": { "xs": 12, "sm": 14, "md": 16, "lg": 20, "xl": 24, "2xl": 32 }, "weight": {}, "lineHeight": {} },
  "space": { "1": 4, "2": 8, "3": 12, "4": 16, "6": 24, "8": 32 },
  "radius": { "sm": 4, "md": 8, "lg": 16, "full": 999 },
  "shadow": {}, "motion": { "fast": 150, "base": 250 }
}
```
Use nomes semânticos (`text.primary`, `surface.card`) além da paleta base. Corpo de texto ≥ 16. Grid de 4/8.

# Componentes base (cada um com estados: padrão, pressionado, desabilitado, carregando, erro, foco)
Button (primário, secundário, texto, destrutivo), Input/TextField, SearchBar, Card de loja, Card de produto, QuantityStepper, Badge/Tag (aberto/fechado, entrega grátis), BottomSheet, Toast/Snackbar, EmptyState, ErrorState, Skeleton, ListItem, Tabs, Header, StatusTimeline (pedido), PriceSummary.

# Acessibilidade (WCAG 2.2 AA)
Contraste 4.5:1 texto / 3:1 elementos grandes e ícones; alvo de toque ≥ 44pt (iOS) / 48dp (Android); não depender só de cor; suporte a fonte grande; ordem de leitura lógica; labels em ícones.

# Padrões de marketplace local que funcionam
- Home: localização clara no topo, busca, categorias, lojas abertas perto primeiro, tempo e taxa de entrega visíveis antes do clique.
- Confiança: foto real da loja, avaliações, endereço do bairro, políticas claras de troca/cancelamento.
- Carrinho de uma loja por vez (avisar ao trocar).
- Checkout em no máximo 3 passos; PIX com "copiar código" grande, contador de expiração e confirmação automática.
- Acompanhamento do pedido com linha do tempo e contato com a loja (WhatsApp é o canal natural da região).
- Lojista: receber pedido com alerta sonoro forte, aceitar/recusar com 1 toque, gerenciar estoque rápido (pausar produto).

# Microcopy
Português simples, frases curtas, verbo de ação nos botões ("Pagar com PIX", não "Continuar"). Erro diz o que aconteceu e o que fazer. Sem "Ops!", sem culpar o usuário, sem jargão técnico.

# Referências de plataforma
Apple Human Interface Guidelines e Material Design 3 — respeite navegação, gestos e componentes nativos de cada um quando divergirem.
