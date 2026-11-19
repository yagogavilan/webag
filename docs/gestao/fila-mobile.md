# Fila do mobile-dev (app e painéis web), achados do Security

> Criada pelo security-engineer em 2026-11-19 para os achados que não são do back-end. O CEO prioriza; marque `[x]` ao concluir. Detalhe: `docs/seguranca/revisoes/onda-7-reverificacao.md`.

M.1 [x] (web, 2026-11-19: página com vias A/B, desistir e encarregado; BFF `/api/public/account-deletion/<passo>`; Vitest e Playwright; Security repete B1/B2 contra a página) SEC-166 (Alta, bloqueia G5 Google Play), opção 1 recomendada: `/excluir-conta` com a via A/B da WB-214 (e-mail → código; senha se o e-mail não estiver confirmado → revisão dos bloqueios → confirmar), chamando `/v1/auth/account-deletion/*` por rota do host público com o mesmo CSRF de `/api/public/privacy-request`, ticket só no corpo, `Referrer-Policy: no-referrer`. O formulário do DSR fica como alternativa.
M.2 [~] (web FEITO em `/lojista/desistir-da-exclusao` e na página pública; falta o app) SEC-176 (Média, antes do G5): `CancelDeletionForm` (app) e `/lojista/desistir-da-exclusao` (web) tratam 403 `LOGIN_CODE_REQUIRED` com campo de código de 6 dígitos e reenviam `code`.
M.3 [~] SEC-172 (Baixa; FEITO em `app.config.ts`: o build `preview`/`production` do EAS falha sem `EXPO_PUBLIC_API_URL`/`EXPO_PUBLIC_WEB_URL` https, sem localhost e sem o texto de exemplo "SEU-DOMINIO"; falta o resto): `app.config.ts` falha o build de produção sem `EXPO_PUBLIC_API_URL`/`EXPO_PUBLIC_WEB_URL` https; `privacy/export.tsx:104` só abre link da origem da API; `safeDownloadUrl` só `https:` em produção.
M.4 [~] (web: prazos em `deletionFacts()`, um só lugar, com `PUBLIC_DELETION_*` e comentário J1-J14; ler da API depende do pedido W.1 do backend) SEC-178 (Baixa): `/excluir-conta` lê os prazos da API (ou o PO trava os parâmetros) em vez de `public-deletion.ts` fixo.
M.5 [ ] SEC-179 (Baixa): iOS com `NSLocationDefaultAccuracyReduced: true` (ou arredondar lat/lng); decide o rótulo do App Privacy.
M.6 [ ] Pendência 1 do inventário (`seguranca/inventario-lojas.md` §3): consulta de CEP pela API, não direto no ViaCEP.

## Fechamento do app para a v1.0 (mobile-dev, 2026-11-19, DEC-058)

Feito neste ciclo (detalhe nos commits): app no navegador (`pnpm web`, `apps/mobile/scripts/web-smoke.cjs`, captura em `docs/qa/relatorios/app-web-sacola.png`); tela Sobre o Webag e Licenças (Solar CC BY 4.0, Tabler MIT, fontes OFL; Termos e Política por `EXPO_PUBLIC_WEB_URL`; `phosphor-react-native` removido); `EXPO_PUBLIC_WEB_URL`/`API_URL` nos perfis do `eas.json`; acompanhamento do pedido com faixa de chegada, atraso, cancelar sem custo, pedido de cancelamento em saída, cancelado por atraso; pedido de cancelamento no preparo (BUG-015); entregas fechadas/pausadas ("Entrega volta às 9h") no cartão, na loja, na sacola e no checkout; Meus dados (nome e celular, CC2); botão "Simular pagamento" (só dev). Validado no navegador contra a API real (atraso, cancelar sem custo, pedido de cancelamento: capturas `app-web-cancelar-atraso.png`); Android e iOS só por Jest e `expo export` (nada em aparelho).

### O que falta do BACK-END (o app só implementa o que o contrato expõe)

| # | Falta | Efeito no app hoje | Dono |
|---|---|---|---|
| F1 | Rota de dev **por pedido** para simular o PIX: `POST /v1/dev/orders/{orderId}/payment/{approve\|decline\|expire}` (só `NODE_ENV=development\|test` e provedor `fake`, mesmo caminho do webhook; DT-065). Hoje `/v1/dev/payments/{attemptId}/...` pede o id da tentativa, que a API não mostra | O botão "Simular pagamento" já chama a rota por pedido e, enquanto ela não existe (404), avisa "use `pnpm pagar`" | backend-dev |
| F2 | **Compensação por atraso** no pedido: `Order.compensation { kind: free_shipping\|fixed, valueCents, validUntil }` (a migração 0042 cria o cupom pessoal e o push sai, mas o contrato não mostra) e a lista de cupons do cliente (`/v1/me/coupons`, "Ver meus cupons") | O cartão "Passamos do prazo" e "Combinado, seguimos" **não prometem** entrega grátis; falta o bilhete "Entrega grátis no próximo pedido" na tela do pedido entregue com atraso e a tela Meus cupons | backend-dev |
| F3 | `Order.refund { amount, method, expectedBy }` (ou texto pronto) | Copy diz só "na mesma forma de pagamento"; sem "em até 1 dia útil" nem "em até 2 faturas" (depende do meio) | backend-dev, PO |
| F4 | `StoreDelivery.unavailableReason` (`OUT_OF_RANGE`\|`LOGISTICS_CLOSED`\|`LOGISTICS_PAUSED`) nos cartões e na busca | Cartão só sabe "volta às 9h" quando há `logisticsOpensAt`; em pausa sem hora aparece "Fora da área de entrega" (a loja e a sacola sabem: `logisticsClosed`, bloqueio `LOGISTICS_CLOSED`) | backend-dev |
| F5 | Expor `cancelamento_resposta_min` e `entrega_cancel_resposta_min` (ou `respondBy` já na tela do pedido em `allowedActions`) e, na recusa da operação, o horário "chega até HH:MM" (`CancelRequest.arrivesBy`) | Antes de pedir, a copy diz "em poucos minutos" (o desenho dizia 10 min fixos; prazo nunca fixo no app); depois de pedir, mostra `respondBy`. Recusa mostra só "Seu pedido segue a caminho" e a nota | backend-dev, product-designer |
| F6 | Faixa mudou antes de pagar: 409 `ETA_CHANGED` (E3a) e `earlier` com a faixa anterior (E3b) | Sem a folha "O horário mudou" nem "Agora chega mais cedo" | backend-dev |
| F7 | Eventos em tempo real de atraso e de decisão do pedido de cancelamento (hoje o app relê por polling a cada 15 s se o canal cair, 60 s com canal) | Aviso de atraso aparece na próxima leitura; sem animação de transição | backend-dev |
| F8 | Lista de espera por região (E9, `waitlist`) e "Fora da área" com retirada próxima; só existe a finalidade de consentimento `waitlist` | Início sem lojas mostra o vazio de sempre | backend-dev, PO |

### Dúvidas de regra de negócio (não decididas pelo app)

- **Compensação ao "continuar esperando"**: o desenho promete entrega grátis para quem espera; a DEC-054 Q2 diz que a compensação vale quando o pedido chega depois do fim da faixa + tolerância, e `entrega_compensacao_tipo` pode ser `nenhuma`. O app não promete até o contrato dizer o que vale (F2). PO decide a copy.
- **"Continuar esperando"** é só estado da tela (some ao reabrir); o contrato não registra a escolha. PO diz se precisa registrar (evento `late_wait_chosen`).
- **Tabler (WhatsApp)**: o copyright "2020-2024 Paweł Kuna" veio do texto do designer; conferir no LICENSE do pacote antes do G5. Razão social, CNPJ e endereço da Webag (identificação do fornecedor, Decreto 7.962/2013) ainda faltam em Sobre o Webag: fundador informa, PO valida o texto.
- **Lista de bibliotecas no app**: em vez de gerar JSON no build (desenho §2.3), a tela abre `<EXPO_PUBLIC_WEB_URL>/licencas` (já gerada por `pnpm licencas`). Tech-lead decide se isso basta para as lojas.
- **`EXPO_PUBLIC_PAYMENT_PROVIDER`**: o app usa `EXPO_PUBLIC_PAYMENT_MODE` (`fake`|`mercadopago`, nunca `fake` em `production`); o botão de simular segue essa regra.

### Pendências do app (fora do que o contrato bloqueia)

- CC2: trocar e-mail (3 passos com senha), alterar senha e "sair de todos os aparelhos" (rotas existem em `/v1/me/password` e `/v1/me/sessions`); excluir conta de quem só tem login social.
- Maestro: fluxos novos (atraso, pedido de cancelamento, Sobre/Licenças) sem E2E em aparelho.
- Web: a sessão fica só na memória da aba; sem localização do aparelho nem push (escolha por cidade/CEP).
