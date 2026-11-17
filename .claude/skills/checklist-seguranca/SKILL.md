---
name: checklist-seguranca
description: Checklist de segurança e privacidade do Webag (OWASP API Top 10, MASVS, pagamentos, abuso de marketplace, LGPD, lojas). Use em threat models, revisões de código/arquitetura e pareceres de release.
---

# Threat model (por funcionalidade sensível)
1. Ativos (dinheiro, dados pessoais, reputação da loja, disponibilidade)
2. Atores (cliente, lojista, admin, atacante externo, lojista mal-intencionado, cliente fraudador, insider)
3. Fluxo de dados (Mermaid) e fronteiras de confiança (app ↔ API ↔ MP ↔ banco)
4. Ameaças STRIDE + abuso de regra de negócio
5. Controles existentes e necessários
6. Risco residual e decisão

# API (OWASP API Security Top 10 — 2023)
- [ ] API1 BOLA/IDOR: todo acesso por ID verifica dono (pedido, endereço, loja, produto)
- [ ] API2 Auth: OTP com expiração, tentativas limitadas, rate limit por telefone e IP; refresh rotativo e revogável
- [ ] API3 Propriedades: DTO de saída explícito (não vazar campos internos); DTO de entrada não aceita `role`, `status`, `price`
- [ ] API4 Consumo de recursos: paginação, limites de tamanho, rate limit, timeouts
- [ ] API5 Autorização por função: rotas de admin/lojista protegidas por papel e testadas
- [ ] API6 Fluxos de negócio sensíveis: cupom, cadastro, OTP, criação de pedido protegidos contra automação
- [ ] API7 SSRF: nenhuma URL fornecida pelo usuário buscada pelo servidor sem allowlist
- [ ] API8 Configuração: CORS restrito, headers de segurança, erros sem stack trace, TLS em tudo
- [ ] API9 Inventário: OpenAPI atualizado, ambientes separados, sem endpoints de debug em prod
- [ ] API10 Consumo de APIs de terceiros: respostas do MP/SMS validadas, timeouts e falhas tratados

# Pagamentos (Mercado Pago)
- [ ] Webhook: assinatura validada, re-consulta do pagamento na API do MP, idempotência, sem confiar no app
- [ ] Valor do pedido calculado no servidor (preço, frete, desconto) — nunca o enviado pelo app
- [ ] Credenciais do MP só no servidor, por ambiente (teste vs. produção)
- [ ] Trilha de auditoria de pagamentos, estornos e repasses

# Mobile (OWASP MASVS)
- [ ] STORAGE: tokens só no secure store; nada sensível em logs, AsyncStorage ou screenshots de telas sensíveis
- [ ] CRYPTO: nenhum segredo embutido no app (tudo no bundle é público)
- [ ] AUTH: sessão invalidada no servidor ao sair; biometria só como conveniência local
- [ ] NETWORK: somente HTTPS; pinning avaliado (custo x benefício) em ADR
- [ ] PLATFORM: deep links validados; permissões mínimas; WebViews sem JS bridge desnecessária
- [ ] CODE: dependências auditadas; builds de produção sem logs de debug
- [ ] RESILIENCE: detecção de root/jailbreak só se houver justificativa (geralmente não no MVP)

# Abuso de marketplace
Contas falsas em massa, abuso de cupom de primeira compra, pedidos falsos contra loja concorrente, lojista que recebe e não entrega, avaliações falsas, enumeração de telefones no OTP, scraping de catálogo. Para cada um: sinal de detecção + controle mínimo.

# Segredos e dependências
- [ ] `.env` fora do git; `.env.example` sem valores reais; segredos em cofre do provedor/CI
- [ ] Busca de segredos no repositório (padrões de chave, `APP_USR-`, `-----BEGIN`)
- [ ] `pnpm audit`/`npm audit` sem Crítica/Alta aberta sem justificativa

# LGPD (mínimo para o MVP)
- [ ] Inventário: quais dados pessoais, de quem, para quê, base legal, onde ficam, quanto tempo
- [ ] Minimização: CPF só se obrigatório (ex.: exigência do meio de pagamento); localização precisa só durante uso
- [ ] Compartilhamento com lojista limitado ao necessário para a entrega (nome, telefone, endereço do pedido)
- [ ] Política de privacidade e termos de uso publicados e linkados no app (texto validado por profissional)
- [ ] Direitos do titular: ver/editar dados e **excluir conta pelo app** (exigido também por Apple e Google)
- [ ] Encarregado (DPO) indicado ou dispensa avaliada; canal de contato
- [ ] Logs e backups com retenção definida; dados de teste sem dados reais

# Lojas
- [ ] Google Play Data Safety e Apple App Privacy preenchidos de acordo com o inventário real
- [ ] Justificativa de cada permissão (localização, notificações, câmera se houver)
