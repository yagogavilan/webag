---
name: acessibilidade-wcag-mobile-web
description: Checklist e método de auditoria WCAG 2.2 AA para o app (React Native) e os painéis web (Next.js) do Webag, com critérios novos da 2.2, props de acessibilidade e severidade. Use ao escrever a seção "Acessibilidade" de uma spec, revisar uma tela implementada ou antes do G4.
---

# Metas do Webag (mais rígidas que o mínimo WCAG)
| Item | Meta Webag | Observação |
|---|---|---|
| Contraste texto | 4,5:1 (3:1 texto grande, ícones, bordas de campo) | Medir com tokens, em tema claro e escuro, sol forte |
| Alvo de toque | 44pt iOS / 48dp Android | WCAG 2.5.8 exige só 24x24 px; usamos o maior. Espaço entre alvos pequenos |
| Fonte | Suportar escala do sistema até 200% sem cortar nem sobrepor | RN: não fixar altura de texto; limitar `maxFontSizeMultiplier` só onde quebra |
| Cor | Nunca única pista (aberto/fechado, erro, status do pedido) | Ícone + texto + cor |

# Critérios novos da WCAG 2.2 que mais pegam o Webag
- **Foco não obscurecido (2.4.11):** header/footer fixos e bottom sheets não cobrem o campo focado (checkout, endereço).
- **Arrastar (2.5.7):** todo gesto de arrastar tem alternativa por toque (reordenar, sheet, carrossel).
- **Entrada redundante (3.3.7):** não pedir de novo endereço/telefone já informado no mesmo fluxo.
- **Autenticação acessível (3.3.8):** login por OTP/senha permite colar, autofill de SMS e gerenciador de senhas; sem quebra-cabeça de memória.
- **Ajuda consistente (3.2.6):** o atalho "falar com a loja/suporte" fica no mesmo lugar em todas as telas do fluxo.
- **Limite de tempo (2.2.1):** PIX expira: mostrar contador em texto, avisar antes de expirar e permitir gerar novo código.

# Mobile (React Native)
- Todo toque: `accessibilityRole` (button, link, header, image, tab), `accessibilityLabel` (ícone sozinho sempre), `accessibilityState` (selected, disabled, busy, checked).
- Card de loja/produto: agrupar (`accessible`) com rótulo único "Padaria X, aberta, 30 a 40 min, frete R$ 5,00"; botões internos continuam alcançáveis.
- Mudança assíncrona (toast, PIX copiado, status do pedido): anunciar com `AccessibilityInfo.announceForAccessibility` e `accessibilityLiveRegion="polite"` (Android).
- Ordem de leitura = ordem visual; título de tela com role `header`; foco move para o título ao abrir modal e volta ao gatilho ao fechar.
- Movimento: ler `AccessibilityInfo.isReduceMotionEnabled` (ver `movimento-e-microinteracoes`). Teclado: tipo (`inputMode`, `textContentType`, `autoComplete`) correto por campo.
- Testar com TalkBack (Android é o foco) e VoiceOver.

# Web (painéis lojista/admin)
HTML semântico antes de ARIA; `<button>` para ação, `<a>` para navegação; label em todo campo; erro inline + foco no primeiro erro; `:focus-visible` nunca removido sem substituto; tabelas com `<th scope>`; `aria-live="polite"` para novos pedidos; hierarquia de títulos; link "pular para o conteúdo"; nunca `user-scalable=no`.
Alerta de pedido novo (lojista): som **e** sinal visual/vibração; nunca só som.

# Auditoria em 5 camadas (ordem)
1. Automática (axe/Lighthouse no web; lint de a11y no RN): pega só 30 a 40% [fonte original].
2. Teclado (web): alcançável, ordem, foco visível, sem armadilha, Esc fecha modal.
3. Leitor de tela: rótulos, estados, anúncios, ordem.
4. Visual: contraste, fonte 200%, reflow, alvos.
5. Fluxos: login/OTP, busca, sacola, checkout PIX, acompanhar pedido, aceitar pedido (lojista).

# Severidade e saída
Crítica (impede concluir compra/aceite) e Alta bloqueiam G4; Média na próxima sprint; Baixa backlog. Achado: `tela | critério WCAG | severidade | como reproduzir | correção`. Salvar em `docs/design/revisoes/a11y-<slug>.md`; bug vira `BUG-###` para o QA.

## Fontes e licença
- webiscorp/designskill-open, skill `accessibility-audit` (MIT, LICENSE conferido), consultada em 2026-11-22. Adaptado: camadas de auditoria, severidade e critérios 2.2; acrescentados props de React Native, metas Webag, PIX e alerta do lojista. Descartado: bloco "regras para agentes" instalável em CLAUDE.md.
- W3C WCAG 2.2 (critérios 2.2.1, 2.4.11, 2.5.7, 2.5.8, 3.2.6, 3.3.7, 3.3.8), conhecimento geral.
- vercel-labs/web-interface-guidelines (MIT), 2026-11-22: regras web de foco e formulários.
