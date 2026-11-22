---
name: revisao-heuristica-ux
description: Auditoria de UX por heurísticas de Nielsen com escala de severidade e checklist de interface web/mobile, para revisar telas desenhadas ou implementadas contra a spec. Use ao revisar uma entrega do mobile-dev, uma spec antes do G2 ou quando o checkout/fluxo parecer atritado.
---

# Regra de ouro
Crítica é sobre **efetividade, não gosto**. Sem evidência (dado, heurística, padrão de mercado, teste), recomende teste com 3 a 5 pessoas em vez de opinar. Calibre pela fidelidade: wireframe recebe crítica de hierarquia e fluxo; protótipo, de contraste e copy; produto implementado, avaliação completa mais desvios da spec.

# Processo (9 passos, em ordem)
1. Contexto: quem usa, tarefa, ponto da jornada, restrição (Android de entrada, sol, pressa, 3G).
2. Scan de 5 segundos: o que se entende da tela? Qual a ação principal?
3. Passada pelas 10 heurísticas (tabela abaixo), anotando violações.
4. Teste de Krug por tela: escaneável? escolhas óbvias? navegação clara? boa vontade (não irrita)?
5. Comparar com a spec em `docs/design/telas/<slug>.md`: listar desvios objetivos.
6. Conferir os 4 estados (carregando, vazio, erro, sem conexão) e permissão negada.
7. Rodar o checklist de interface abaixo.
8. Atribuir severidade; sintetizar do mais grave ao menos grave.
9. Registrar em `docs/design/revisoes/<slug>.md`.

# Heurísticas aplicadas ao Webag
| # | Heurística | Pergunta típica no marketplace |
|---|---|---|
| H1 | Visibilidade do status | Sei se o PIX foi pago e em que etapa está o pedido? |
| H2 | Linguagem do mundo real | Os termos são os da loja do bairro? |
| H3 | Controle e liberdade | Consigo voltar, editar a sacola, desfazer remoção? |
| H4 | Consistência | Mesma ação, mesmo rótulo e lugar em todo o app? |
| H5 | Prevenção de erro | Loja fechada, fora do raio, pedido mínimo: aviso antes de pagar? |
| H6 | Reconhecer em vez de lembrar | Endereço e pagamento anteriores vêm preenchidos? |
| H7 | Flexibilidade e eficiência | Repetir pedido, atalhos do lojista (pausar produto em 1 toque) |
| H8 | Design estético e minimalista | Cada campo/passo se justifica? Checkout em até 3 passos |
| H9 | Ajudar a recuperar de erros | Mensagem diz o que fazer? Há "tentar de novo"? |
| H10 | Ajuda e documentação | Contato com a loja/suporte visível no pedido |

# Severidade (0 a 4)
| Nota | Significado | Ação |
|---|---|---|
| 0 | Não é problema | Nenhuma |
| 1 | Cosmético | Se sobrar tempo |
| 2 | Menor | Backlog de baixa prioridade |
| 3 | Grave: dificulta muito a tarefa | Corrigir na sprint |
| 4 | Catastrófico: impede concluir (pagar, aceitar pedido) | Bloqueia release (G4) |

# Checklist de interface (condensado das diretrizes web de interface)
- Formulários: tipo e `inputMode`/`autoComplete` certos; colar nunca bloqueado; erro inline e foco no primeiro erro; botão de enviar não "morre" antes da requisição; aviso ao sair com dados não salvos.
- Ação destrutiva com confirmação nomeada ou desfazer. Gesto sempre com alternativa por toque.
- Texto longo e dados extremos: truncar, quebrar, vazio, nome de loja gigante, preço de 5 dígitos.
- Imagem com dimensões reservadas (sem salto de layout); lista longa virtualizada.
- Web: estado de filtro/aba/página na URL; link abre em nova aba; foco visível; sem `transition: all`.
- Datas e números com `Intl` pt-BR; alvo de toque 44pt/48dp.

# Formato do achado
`ID | tela | heurística | severidade | evidência (o que vi / dado) | impacto no usuário | correção sugerida | dono (designer/dev/PO)`.
Termine com: top 3 problemas, o que está bom (para não ser desfeito), perguntas que exigem teste com usuário.

# Postura
Sem elogio vazio. Contradiga PO/CEO com custo explícito (ex.: "+1 campo no checkout piora conversão [HIPÓTESE]: medir"). Desvio da spec é bug de implementação; lacuna da spec é falha do designer: assuma a sua.

## Fontes e licença
- webiscorp/designskill-open, skill `design-critique` (MIT, LICENSE conferido), consultada em 2026-11-22. Adaptado: método em 9 passos, escala 0 a 4, fórmula de feedback e Krug; heurísticas reescritas para o marketplace.
- vercel-labs/web-interface-guidelines, `command.md` (MIT, LICENSE conferido), 2026-11-22. Adaptado: checklist de formulários, conteúdo, imagens, navegação e estado na URL; regras de Title Case e idioma do original não adotadas (pt-BR).
- Heurísticas de Nielsen: conhecimento geral.
