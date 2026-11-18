# Plano de teste — Onda 1 (identidade, configuração e base de dinheiro)

Dono: qa-engineer | Data: 2026-11-18 | Estratégia: `docs/qa/estrategia.md` | Ferramentas: ADR-006
Numeração: a do `plano-execucao.md` (Onda 1 = sub-ondas 1A e 1B = "onda 0" do backlog), mais as histórias de segurança de acesso que o backlog põe nessa onda (WB-219 a 224).

**Histórias:** 1A: WB-100, 101, 106, 117, 118, 119, 120, 123. 1B: WB-006, 007, 008, 009, 050, 150, 153, 155, 194, 210, 211. Segurança: WB-219, 220, 221, 222, 223, 224 (parcial). **Requisitos SEC cobertos:** 001-008, 010, 011, 013-017, 020-022, 031-036, 043, 072-075, 080-083, 085.
Prioridade e tipo: legenda em `estrategia.md` §7. `R-nn` = pendência de definição em `revisao-testabilidade.md`; o caso assume o comportamento indicado e muda se o PO decidir diferente. "Diferido" = só executável quando a onda indicada entregar a dependência; o caso já fica escrito.

## 1. Pré-condições e ambiente
- Stack do compose (Postgres+PostGIS, Redis, Mailpit, API, web) com `PAYMENT_PROVIDER=fake`; `FakeClock` na API; builders (`buildUser`, `buildAdmin`) em `apps/api/test/builders`.
- Hosts separados para painel do lojista e do admin no compose (ex.: `app.localtest.me` e `admin.localtest.me`) para SEC-082 (pedir ao backend-dev se ausente).
- Provedor de e-mail: Mailpit (API HTTP do Mailpit usada pelos testes para ler o código; nunca ler o código do banco).
- Pendências externas: MP sandbox (SEC-044, PKCE) e gateway Socket.IO (ADR-004) ainda não existem; os casos de socket de WB-219 ficam "diferido (onda 4)" e a parte HTTP roda agora.

## 2. Casos

### 2.1 Cadastro de cliente (WB-006, WB-210, WB-211, SEC-001, 022, 063)
| ID | Origem | Caso (Dado/Quando/Então) | Tipo | P |
|---|---|---|---|---|
| O1-CAD-01 | WB-006 C1 | Dado dados válidos, quando `POST /auth/register`, então 201, conta "não confirmada", resposta sem `passwordHash` e sem CPF/endereço/nascimento | API | P0 |
| O1-CAD-02 | WB-006 C1, DEC-012 | Dado a tela de cadastro, então tem exatamente nome, e-mail, celular com máscara (11) 99999-9999, senha, confirmar senha, termos e 18+; não pede CPF, endereço nem nascimento; confirmação diferente da senha mantém Continuar inativo | E2E-M/comp | P1 |
| O1-CAD-03 | SEC-001, WB-006 C2 | Senha de 7 caracteres → 422; 8 → 201; 128 → 201; 129 → 422; `12345678`, `senha123`, `password`, `qwerty123` → 422 **no servidor** (cliente adulterado ignora o medidor) | API | P0 |
| O1-CAD-04 | SEC-001 | Hash persistido começa com `$argon2id$v=19$m=19456,t=2,p=1`; coluna não contém a senha em claro | INT | P0 |
| O1-CAD-05 | SEC-001 | Senha de 128 caracteres (com acento e espaço) não é truncada: login com os 128 passa; trocar só o último caractere falha | API | P1 |
| O1-CAD-06 | WB-006 C2, R-05 | Medidor: `abc` e `12345678` mostram "Fraca" e Continuar inativo; frase longa mostra "Boa" e ativa | comp | P2 |
| O1-CAD-07 | WB-006 C3 | E-mail já cadastrado (confirmado e não confirmado): mesma mensagem "Esse e-mail já tem conta. Entrar?", sem indicar confirmação; status e corpo idênticos nos dois casos | API | P1 |
| O1-CAD-08 | WB-006 C3 | `Joao@X.com`, `joao@x.com` e `" joao@x.com "` são o mesmo e-mail (duplicidade); e-mail inválido (`a@b`, `a b@c.com`) → 422 | API | P1 |
| O1-CAD-09 | WB-006 C4, WB-210 C1 | Termos não marcados: botão inativo na UI e 422 na API se `acceptTerms=false`; links abrem em tela própria | API/comp | P1 |
| O1-CAD-10 | WB-210 C2 | Aceite grava versão dos termos e da privacidade, data/hora, IP e plataforma | INT | P1 |
| O1-CAD-11 | WB-006 C6, WB-224 C5 | `a@gmial.com` mostra "Você quis dizer gmail.com?"; aceitar troca o campo; manter envia o digitado | comp | P2 |
| O1-CAD-12 | SEC-063 | 20 cadastros/h por IP: 21º → 429; 4ª conta no mesmo dispositivo/dia → 429; domínio descartável não bloqueia | API | P1 |
| O1-CAD-13 | SEC-022 | Corpo com `role:"admin"`, `emailVerified:true`, `status`, `userId` → 400 (whitelist) | API | P0 |
| O1-CAD-14 | WB-006 C1, HIP-026 | Sem declaração 18+ → 422 | API | P2 |
| O1-CAD-15 | WB-006 C1 | Celular: `(11) 99999-9999` ok; `(00) 99999-9999`, 8 dígitos, letras → 422; guarda normalizado | API | P2 |
| O1-CAD-16 | WB-006 | Duas requisições simultâneas com o mesmo e-mail → 1 conta criada, a outra 409; duplo toque em "Criar conta" → 1 conta | CONC | P1 |
| O1-CAD-17 | WB-035, WB-006 | Enviar o formulário em modo avião: mensagem "sem conexão" com ação, campos preservados; ao voltar a rede, reenviar funciona sem duplicar | E2E-M | P2 |
| O1-CAD-18 | WB-211 C1 | Os consentimentos (marketing push, marketing e-mail, localização precisa, lista de espera) são separados e **desmarcados**; aceitar termos não marca nenhum | API/comp | P1 |
| O1-CAD-19 | WB-211 C2-C3 | Conceder grava tipo, versão do texto, data/hora, canal; revogar vale na próxima requisição e grava revogação; histórico preservado | INT | P1 |
| O1-CAD-20 | WB-211 C4 | Recusar todos os opcionais: cadastro e uso seguem completos | E2E-M | P1 |
| O1-CAD-21 | WB-210 C3, R-35 | Nova versão relevante: usuário ativo é barrado até aceitar (resposta específica na API, tela de aceite no app); recusar → logout | API/E2E-M | P1 |
| O1-CAD-22 | WB-210 C4 | Lojista aceita também os Termos do Lojista; sem eles o cadastro de lojista falha | API | P1 |

### 2.2 Confirmação por código e e-mails (WB-007, WB-194, SEC-002, 003, 008d)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O1-COD-01 | WB-007 C1, SEC-002 | Após cadastrar, o Mailpit recebe e-mail com código de 6 dígitos; corpo só com código e texto genérico (sem nome, endereço, itens, valores) | INT | P0 |
| O1-COD-02 | WB-007 C2 | Código certo em 9 min 59 s confirma e leva ao ponto de origem; com 10 min 01 s → "Código vencido" | API (FakeClock) | P1 |
| O1-COD-03 | WB-007 C3, SEC-002 | 5 erros invalidam o código: a 6ª tentativa com o código certo → 400; mensagem "Código incorreto" e tentativas restantes visíveis | API | P0 |
| O1-COD-04 | SEC-002 | Código de `verify_email` usado em `reset_password` → 400 (finalidade) | API | P0 |
| O1-COD-05 | SEC-002 | Reusar código já aceito → 400 | API | P0 |
| O1-COD-06 | WB-007 C4, SEC-003 | Reenviar com 30 s → 429; com 61 s → ok; 6º reenvio na hora → 429; após reenviar, o código anterior → 400 | API (FakeClock) | P1 |
| O1-COD-07 | SEC-002 | Banco guarda só HMAC (nenhuma coluna com os 6 dígitos em claro; o mesmo código para dois usuários gera valores diferentes) | INT | P0 |
| O1-COD-08 | SEC-002 | Código com zero à esquerda (`004213`) é aceito de ponta a ponta (não vira número 4213) | UNIT/API | P1 |
| O1-COD-09 | SEC-002 | Duas submissões simultâneas do mesmo código certo → uma aceita, a outra 400 | CONC | P0 |
| O1-COD-10 | SEC-003 | 30 envios/h por IP e 10/dia por destinatário: o seguinte → 429 | API | P2 |
| O1-COD-11 | SEC-072 | Logs do envio e da verificação não contêm o código nem o e-mail inteiro (mascarado) | INT | P0 |
| O1-COD-12 | WB-194 C3 | Com `NODE_ENV` ≠ produção, todo e-mail vai ao Mailpit; nenhum transporte SMTP externo é instanciado | INT | P1 |
| O1-COD-13 | WB-194 C2 | SMTP fora do ar: cadastro conclui, envio é retentado com espera crescente até 5 vezes e registrado; tela oferece "Reenviar" | INT | P1 |
| O1-COD-14 | WB-194 C1, C4 | Snapshot de cada template da onda (código, redefinição, senha alterada, tentativas de acesso): pt-BR, assunto claro, link de ajuda; sem CPF, senha ou endereço completo | UNIT | P1 |
| O1-COD-15 | WB-194 C5 | E-mail de marketing não é enviado sem consentimento ativo (WB-211); link de descadastro funciona em 1 clique. Diferido (onda 5, WB-196); aqui só: nenhum template de marketing sai sem opt-in | INT | P2 |
| O1-COD-16 | SEC-008d, R-33 | E-mail para endereço **não confirmado** nunca traz dados do pedido; vale também para e-mails de pedido (diferido, onda 4) | UNIT | P0 |

### 2.3 Login, sessão e tokens (WB-008, 219, 220, 221, SEC-004, 010, 011, 012, 013, 014)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O1-LOG-01 | WB-008 C1 | Credenciais certas → access (15 min) + refresh; segue logado; refresh guardado só como SHA-256 no banco | API/INT | P0 |
| O1-LOG-02 | WB-008 C2, SEC-004 | E-mail inexistente e senha errada: mesmo status, mesmo corpo "E-mail ou senha incorretos", e mediana de tempo de 30 amostras com diferença < 100 ms (hash também roda para inexistente) | API | P0 |
| O1-LOG-03 | WB-221 C1, SEC-004 | 5 falhas do IP A contra a conta X → 6ª do IP A = 429 com `Retry-After` e "Muitas tentativas. Tente em 15 minutos ou redefina a senha" | API | P0 |
| O1-LOG-04 | WB-221 C2 | Durante a espera do IP A, IP B com a senha certa entra (200); conta nunca vira "bloqueada" (nenhum campo de bloqueio mudou no banco) | API/INT | P0 |
| O1-LOG-05 | WB-221 C3, SEC-004 | 20 falhas contra X vindas de 21 IPs distintos em 1 h → próximo login com senha certa exige código por e-mail; com o código certo entra; 61 min depois o contador zera | API (FakeClock) | P0 |
| O1-LOG-06 | SEC-004 | Limite por IP de 60 tentativas/min (CGNAT): 61ª → 429, 60 tentativas de contas diferentes no mesmo IP passam | API | P1 |
| O1-LOG-07 | WB-221 C5 | App mostra tempo restante e o atalho "Redefinir senha" durante a espera | E2E-M/comp | P2 |
| O1-LOG-08 | WB-221 C6 | O mesmo limite vale para login de lojista e de admin; confirmação de senha em "Excluir conta" e "Exportar dados" (diferido, onda 5) | API | P1 |
| O1-LOG-09 | WB-221 C7 | 25 falhas na conta de lojista → 1 e-mail "Tentativas de acesso na sua conta"; nunca mais que 1 por hora | INT | P2 |
| O1-LOG-10 | WB-008 C4 | Conta bloqueada pelo admin: senha certa → "Conta indisponível. Fale com o suporte" com link; nenhuma sessão criada | API | P1 |
| O1-LOG-11 | WB-008 C5 | Conta não confirmada entra e vê "Confirme seu e-mail"; ações limitadas pela WB-224 | E2E-M | P1 |
| O1-LOG-12 | SEC-010 | Access com `alg:none`, assinado com segredo errado, `typ=refresh`, `iss`/`aud` errados, `exp` vencido (+15 min 1 s) → 401 em cada caso (parametrizado) | API | P0 |
| O1-LOG-13 | SEC-010, SEC-014 | Logout: o mesmo access responde 401 em até 5 s (Redis com invalidação); com Redis parado, a checagem de `sid` cai no banco e continua negando | INT | P0 |
| O1-LOG-14 | SEC-011 | Refresh rotaciona: novo par a cada uso; o antigo, após a janela, é inválido | API | P0 |
| O1-LOG-15 | WB-220 C1, SEC-011 | Dois refresh simultâneos com o mesmo token → ambos recebem o mesmo par; nenhum é deslogado | CONC | P0 |
| O1-LOG-16 | WB-220 C3, SEC-011 | Reuso do refresh antigo aos 29 s → mesmo par; aos 31 s → família revogada e o par novo também falha (401) | API (FakeClock) | P0 |
| O1-LOG-17 | SEC-011 | Dia 91 do login → 401 mesmo com uso diário; 31 dias sem uso → 401; uso no dia 29 estende (deslizante) | UNIT/API | P1 |
| O1-LOG-18 | WB-220 C2 | App: 5 requisições com 401 simultâneas disparam **uma** renovação; as demais esperam e reenviam | comp (jest) | P1 |
| O1-LOG-19 | WB-220 C4 | Evento `token_refresh_replayed` registrado com classificação dentro/fora da janela | INT | P2 |
| O1-LOG-20 | WB-219 C3 | Sessão revogada: app mostra "Sua sessão foi encerrada. Entre de novo"; carrinho de visitante e rascunhos preservados | E2E-M/comp | P1 |
| O1-LOG-21 | WB-219 C1, C4, SEC-014 | "Sair de todos os dispositivos": as 2 sessões recebem 401 em até 5 s, inclusive access ainda não vencido. Parte de socket: diferido (onda 4, ADR-004) | INT | P0 |
| O1-LOG-22 | WB-219 C5 | Toda revogação grava auditoria (quem, motivo, hora) | INT | P1 |
| O1-LOG-23 | SEC-012 | Grep CI: nenhuma ocorrência de token, código ou CPF em `AsyncStorage`/MMKV/log; tokens só em `expo-secure-store`; logout apaga o SecureStore e o refresh antigo → 401 | SEG/comp | P0 |
| O1-LOG-24 | SEC-013 | Painel web: cookie de access `__Host-` (Secure, HttpOnly, SameSite=Lax, Path=/); refresh `__Secure-` com Path=/v1/auth | API/E2E-W | P0 |
| O1-LOG-25 | SEC-013 | Mutação sem `X-Webag-Client` → 403; `Origin: https://evil.example` → 403; preflight de origem fora da lista sem `Access-Control-Allow-Origin`; CORS nunca `*` com credenciais | API | P0 |
| O1-LOG-26 | WB-008 | Duplo toque em "Entrar" e token expirando durante a digitação não geram erro visível ao usuário | E2E-M | P2 |

### 2.4 Redefinição e troca de senha (WB-009, SEC-006, 007)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O1-RST-01 | WB-009 C1, SEC-003 | E-mail cadastrado e inexistente: mesma resposta "Se o e-mail existir, enviamos um código" e tempo equivalente (mediana, ±100 ms); só o existente recebe e-mail | API | P0 |
| O1-RST-02 | WB-009 C2, SEC-006 | Código válido + nova senha: senha muda, e-mail vira "confirmado", 2 sessões ativas → refresh de ambas 401 e access antigo 401 em até 5 s; usuário entra com a nova | INT | P0 |
| O1-RST-03 | WB-009 C2, SEC-001, R-21 | Nova senha fraca (`12345678`) → 422 e o código **continua válido** para nova tentativa | API | P1 |
| O1-RST-04 | WB-009 C3 | Código inválido/expirado → erro e pode pedir outro; 5 erros invalidam | API | P1 |
| O1-RST-05 | WB-009 C4, SEC-006 | E-mail "Sua senha foi alterada" chega ao Mailpit com data/hora; sem a senha | INT | P1 |
| O1-RST-06 | WB-009 | Dois resets simultâneos com o mesmo código → 1 sucesso, 1 falha | CONC | P1 |
| O1-RST-07 | WB-009, R-21 | Conta bloqueada pelo admin faz reset: senha muda, mas login segue "Conta indisponível" | API | P1 |
| O1-RST-08 | SEC-007 | Troca de senha logado sem a senha atual → 403; com senha atual errada conta no limite do WB-221 | API | P0 |
| O1-RST-09 | SEC-072 | Logs de `/auth/*` não contêm `password`, `code`, `token`, `refresh` (testa o logger com payload real do endpoint) | INT | P0 |
| O1-RST-10 | WB-009 | Tela de código: teclado numérico, 6 campos aceitam colar o código, foco avança, fonte grande sem corte | A11Y/E2E-M | P2 |

### 2.5 E-mail não confirmado (WB-224, SEC-008) — parcial; o checkout chega na onda 4
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O1-NCF-01 | WB-224 C4, SEC-008e | "Corrigir e-mail" com senha: novo e-mail recebe código, o anterior → 400, o e-mail antigo não recebe mais nada | API/INT | P0 |
| O1-NCF-02 | WB-224 C4 | "Corrigir e-mail" sem senha ou com senha errada → 403 | API | P0 |
| O1-NCF-03 | WB-224 C2, SEC-008b | Conta não confirmada: tornar-se lojista, aceitar convite de funcionário/admin, trocar e-mail confirmado → 403 em cada (parametrizado). Cupom da plataforma e exportação: diferido (ondas 4 e 5) | API | P0 |
| O1-NCF-04 | WB-224 C1, SEC-008a, R-11 | 2º pedido pago de conta não confirmada → 403 `email_verification_required`; confirmado o código na própria tela, o pagamento segue. Diferido (onda 4) | API | P0 |
| O1-NCF-05 | WB-224 C1, R-11 | Dois checkouts simultâneos de conta não confirmada com PIX aprovado nos dois → no máximo 1 pedido pago (o 2º é barrado ou estornado). Diferido (onda 4) | CONC | P0 |
| O1-NCF-06 | WB-224 C3, SEC-008c | Excluir conta não confirmada só com senha → 204. Diferido (onda 5) | API | P1 |
| O1-NCF-07 | WB-224 C9, HIP-D07 | Flag desligada: volta "confirmar antes de comprar" sem mudança de código. Diferido (onda 4) | API | P2 |
| O1-NCF-08 | WB-224 | Parâmetro `email_nao_confirmado_pedidos_max` (0-3) respeitado: 0 bloqueia o 1º pedido | API | P1 |

### 2.6 Autorização, configuração e segurança transversal (SEC-020, 021, 022, 036, 043, 072-075, 080, 081, 085)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O1-SEG-01 | SEC-021 | Matriz perfil × rota gerada da tabela única de permissões (cliente, dono, 4 admins): todas as rotas existentes batem com a tabela; rota nova sem `@Public()` → 401 | API | P0 |
| O1-SEG-02 | SEC-020 | Matriz BOLA gerada do `openapi.yaml`: usuário A cria, usuário B acessa por GET/PATCH/DELETE → 404 em 100% das rotas com `{id}` existentes (o teste falha se uma rota nova não estiver na matriz) | API | P0 |
| O1-SEG-03 | SEC-022 | Todo DTO de mutação rejeita campo extra (`forbidNonWhitelisted`); schemas de saída (snapshot do OpenAPI) sem `passwordHash`, `refresh`, `totpSecret`, CPF completo | API | P0 |
| O1-SEG-04 | SEC-080 | `validateEnv` em produção falha (sem imprimir o valor) para: `JWT_ACCESS_SECRET` < 32 bytes ou igual ao exemplo, `PAYMENT_TOKEN_ENC_KEY` ausente/inválida, `CORS_ORIGINS` vazio ou com `*`, `MP_WEBHOOK_SECRET` ausente com MP ativo, `/docs` ligado | UNIT | P0 |
| O1-SEG-05 | SEC-036, WB-150 C5 | `NODE_ENV=production` + `PAYMENT_PROVIDER=fake` → processo encerra com erro claro; produção com credencial MP `TEST-` → erro | INT | P0 |
| O1-SEG-06 | SEC-036 | Em produção com provedor MP (credenciais fictícias `APP_USR-`), `/v1/dev/payments/x/approve` → 404 (módulo não registrado), não 403 | API | P0 |
| O1-SEG-07 | SEC-035 | Varredura do OpenAPI: nenhuma rota fora de `/v1/dev/*` altera estado de pagamento (`confirm`, `approve`, `paid`, `capture`) acessível a cliente/lojista | API | P0 |
| O1-SEG-08 | SEC-043 | Grep no bundle do app e do web por `APP_USR-`, `client_secret`, `JWT_`; `infra/env.example` sem valor real; varredura de segredos (gitleaks) no CI | SEG | P0 |
| O1-SEG-09 | SEC-072 | Logger com payload contendo `authorization`, `cookie`, `password`, `code`, `token`, `refresh`, `cpf`, `cardNumber`: tudo `[REDACTED]`; e-mail e telefone mascarados | UNIT | P0 |
| O1-SEG-10 | SEC-073 | Erro forçado no login: evento do Sentry (transporte de teste) sem senha, token ou e-mail; `sendDefaultPii=false`; sem replay nas telas de auth | INT | P1 |
| O1-SEG-11 | SEC-075 | Registro de acesso (login, refresh, IP, data/hora, user agent) existe; job apaga registros > 6 meses e mantém os de 5 meses | INT (FakeClock) | P1 |
| O1-SEG-12 | SEC-081 | Headers: HSTS e `nosniff` (produção), `frame-ancestors 'none'` nos painéis; erro 500 forçado devolve RFC 9457 sem stack em produção | API | P1 |
| O1-SEG-13 | SEC-085 | CI tem `pnpm audit --audit-level high`, lockfile versionado e varredura de segredos; PR de teste com dependência Alta conhecida falha | MAN/CI | P1 |
| O1-SEG-14 | SEC-025 | Schemas expõem IDs como UUID; nenhuma rota aceita ID sequencial | API | P2 |
| O1-SEG-15 | ADR-006 | Gate de CI: OpenAPI gerado do código = `openapi.yaml` versionado; divergência reprova o PR | CI | P1 |

### 2.7 Admin: login, perfis, TOTP, convite, endereço próprio (WB-100, 101, 222, 223; SEC-015, 016, 017, 082, 083)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O1-ADM-01 | WB-100 C1, C5 | Cada um dos 4 perfis entra e vê só o menu do seu perfil; abrir por URL tela sem permissão → 403; matriz RN-13/PRD gerada da tabela única (ex.: suporte edita loja → 403; financeiro aprova loja → 403; operação altera comissão → 403) | E2E-W/API | P0 |
| O1-ADM-02 | WB-100 C4 | Cliente e lojista chamando rotas admin → 403 e linha na auditoria | API | P0 |
| O1-ADM-03 | WB-100 C2, SEC-004 | 5 falhas de admin do mesmo IP → espera de 15 min e evento na auditoria; o admin com senha certa em outro IP entra | API | P0 |
| O1-ADM-04 | WB-100 C3, R-04 | 30 min sem atividade → sessão expira com aviso; 29 min com requisições → continua | E2E-W (relógio) | P1 |
| O1-ADM-05 | WB-100 C6, WB-222 C3 | Admin com senha certa sem TOTP configurado: só alcança a tela de configurar o TOTP; qualquer outra rota/API → 403 | API/E2E-W | P0 |
| O1-ADM-06 | WB-222 C1 | Convite → criar senha → configurar TOTP (QR/segredo) → confirmar código antes de ver qualquer tela | E2E-W | P0 |
| O1-ADM-07 | WB-222 C2 | 10 códigos de recuperação exibidos uma única vez (recarregar não mostra de novo); guardados com hash; cada um vale uma vez | INT/E2E-W | P0 |
| O1-ADM-08 | WB-222 C4, R-06 | Código TOTP errado → 401 com a mesma resposta de senha errada (não diz qual passo falhou); aceita janela de ±1 passo (30 s), rejeita ±2; o **mesmo** código válido reutilizado na janela é rejeitado | UNIT/API | P0 |
| O1-ADM-09 | WB-222 C4, R-06 | 1.000 códigos TOTP errados contra uma conta vindos de 10 IPs → conta limitada por tentativas (não só por IP). **Esperado a definir pelo Security; hoje é lacuna** | API | P0 |
| O1-ADM-10 | WB-222 C5 | Código de recuperação entra uma vez e força reconfigurar o TOTP; 2º uso → 401 | API | P0 |
| O1-ADM-11 | WB-222 C5 | Super admin redefine o TOTP de outro admin (auditado); o próprio → 403; operação/financeiro/suporte → 403 | API | P0 |
| O1-ADM-12 | WB-222 C6, SEC-016 | Ação sensível (gerenciar admins agora; estornar e revelar PII depois) com TOTP > 5 min → 403 `reauth_required`; 4 min 59 s passa, 5 min 01 s falha; novo TOTP libera | API (FakeClock) | P0 |
| O1-ADM-13 | WB-222 C7 | Dono de loja sem TOTP entra normalmente | API | P2 |
| O1-ADM-14 | WB-222, SEC-015 | Segredo do TOTP guardado cifrado (nunca em claro no banco, log ou auditoria) [requisito implícito] | INT | P1 |
| O1-ADM-15 | WB-101 C1, SEC-017 | Convite de admin: token de 256 bits só com hash no banco, ligado ao e-mail, válido 48 h: 47 h 59 min ok; 48 h 01 min → 410; usado 2× → 410; revogado → 410; aberto por outro e-mail → 410 | API (FakeClock) | P0 |
| O1-ADM-16 | WB-101 C2, SEC-014 | Trocar perfil ou desativar vale na hora; sessões encerradas (401 em até 5 s); socket: diferido (onda 4) | INT | P0 |
| O1-ADM-17 | WB-101 C3 | Desativar/rebaixar o último super admin → bloqueado "Precisa existir ao menos 1 super admin"; dois super admins se desativando ao mesmo tempo sobra pelo menos 1 | CONC | P0 |
| O1-ADM-18 | WB-101, SEC-016 | Só super admin gerencia admins; operação/financeiro/suporte → 403; exige TOTP vigente | API | P0 |
| O1-ADM-19 | WB-101 C4 | Convite, mudança de perfil, desativação e redefinição de TOTP geram auditoria | INT | P1 |
| O1-ADM-20 | WB-223 C1, SEC-082 | Painel admin só abre no host próprio; cookie de sessão do lojista não é enviado ao host admin e vice-versa | E2E-W | P0 |
| O1-ADM-21 | WB-223 C2 | Lojista logado no painel do lojista abre o host admin → sem sessão (401/403) | E2E-W | P0 |
| O1-ADM-22 | WB-223 C3, SEC-083 | Nome de categoria `<script>alert(1)</script>` e `<img src=x onerror=alert(1)>` renderizam como texto no admin; nenhum diálogo aparece. Repetir com loja/produto na onda 2 | E2E-W | P0 |
| O1-ADM-23 | WB-223 C4, SEC-083 | Header CSP do admin com `script-src 'self'` sem `unsafe-inline`; `frame-ancestors 'none'`; grep de `dangerouslySetInnerHTML` com conteúdo de usuário = 0 | API/lint | P0 |
| O1-ADM-24 | WB-100 | Primeiro super admin nasce por seed/CLI documentado, com TOTP obrigatório; sem credencial padrão fraca em produção | INT | P0 |

### 2.8 Auditoria (WB-123, SEC-074)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O1-AUD-01 | WB-123 C1, SEC-074 | Cada ação admin da onda (parâmetro, flag, região, categoria, termos, convite, mudança de perfil, TOTP, acesso negado) gera 1 linha com ator, perfil, hora, IP, ação, alvo e antes/depois | INT | P0 |
| O1-AUD-02 | WB-123 C3, SEC-074 | `UPDATE` e `DELETE` em `audit_log` pela role da aplicação → erro; não existe rota de edição/exclusão | INT | P0 |
| O1-AUD-03 | WB-123 C4 | Falha ao gravar o log (injetada) → a ação sensível **não** conclui e o estado fica inalterado (rollback) | INT | P0 |
| O1-AUD-04 | WB-123 C1 | `antes/depois` sem segredos: varredura por `secret`, `token`, `hash`, `totp` = 0 | INT | P0 |
| O1-AUD-05 | WB-123 C2 | Filtros por ator, ação, alvo e período; paginação de 50; período usa America/Sao_Paulo (fim do dia 23:59 incluso) | API/E2E-W | P1 |
| O1-AUD-06 | RN-13 | Super admin lê tudo; demais perfis só a leitura própria | API | P1 |
| O1-AUD-07 | HIP-035 | Nenhum job remove `audit_log` antes de 5 anos | INT | P2 |

### 2.9 Parâmetros, flags e regiões (WB-119, 120, 118)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O1-PAR-01 | WB-119 C1 | Seed contém todas as chaves da tabela RN-02, cada uma com valor, padrão, faixa e descrição (o teste lê a tabela da RN-02 e compara com o seed) | INT | P1 |
| O1-PAR-02 | WB-119 C2 | Para cada chave com faixa: mínimo e máximo aceitos; mínimo-1 e máximo+1 → 422 (parametrizado pela RN-02). Ex.: `comissao_padrao_pct` 30,00 ok, 30,01 e -0,01 → 422; 10,005 → 422 | API | P1 |
| O1-PAR-03 | WB-119 C3 | Salvar sem motivo → 422; com motivo → vale a partir de agora, entra no histórico e na auditoria; pedidos com snapshot não mudam (diferido, onda 4) | API/INT | P0 |
| O1-PAR-04 | WB-119 C4 | "Restaurar padrão" volta ao valor do seed com confirmação | API/E2E-W | P2 |
| O1-PAR-05 | WB-119 C5, DEC-011, R-02 | `troca_arrependimento_dias` < 7 e `troca_defeito_dias` < 30 → 422 até para super admin; elevar ao piso ou acima é aceito; tela mostra o aviso jurídico | API | P0 |
| O1-PAR-06 | WB-119, RN-13 | Só super admin edita parâmetros; operação, financeiro e suporte → 403 | API | P0 |
| O1-PAR-07 | WB-119, R-22 | Alterar `pix_expiracao_min` reflete no serviço consumidor dentro do cache definido; edição simultânea por 2 admins não perde o histórico | INT/CONC | P2 |
| O1-PAR-08 | WB-120 C1 | Seed tem as flags (cartão, PIX, retirada, login social, taxa de serviço, cadastro de lojista, trocas voluntárias, push de marketing) e as de HIP-D07/WB-226 (R-34); alternar exige confirmação | API/E2E-W | P1 |
| O1-PAR-09 | WB-120 C2, C4 | Desligar cartão: o endpoint de configuração pública deixa de listá-lo em até 60 s (FakeClock); mudança auditada; pedidos já criados seguem (diferido, onda 4) | API | P1 |
| O1-PAR-10 | WB-120 | Só super admin altera flags; Redis fora → valor do banco (não "tudo ligado") | API/INT | P1 |
| O1-PAR-11 | WB-118 C1 | Seed das 4 cidades do DEC-009; criar bairro por cidade; nome duplicado na mesma cidade → erro; mesmo bairro em cidades diferentes ok | API | P1 |
| O1-PAR-12 | WB-118 C2, C4, RN-03 | Tabela de `isRegionActive(cidade, bairro?)`: cidade ativa + bairro inativo → inativo; cidade ativa + bairro não cadastrado → ativo; cidade inativa + bairro ativo → inativo | UNIT | P0 |
| O1-PAR-13 | WB-118 C2 | Inativar cidade: some da lista pública de regiões; novo checkout bloqueado e pedido em andamento segue (diferido, onda 4) | API | P1 |
| O1-PAR-14 | WB-118 | Permissão: operação e super; suporte e financeiro → 403; auditado | API | P1 |

### 2.10 Categorias e termos (WB-106, WB-117)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O1-CAT-01 | WB-106 C1 | Nome com 30 caracteres ok, 31 → 422; ícone fora da biblioteca → 422; subcategoria sob subcategoria (3º nível) → 422 | API | P1 |
| O1-CAT-02 | WB-106 C2 | Reordenar: o endpoint público lista na nova ordem | API | P2 |
| O1-CAT-03 | WB-106 C3 | Inativar categoria com produtos: some da listagem pública e da busca; produtos preservados no banco | INT | P1 |
| O1-CAT-04 | WB-106 C4 | Excluir com produto/loja vinculados → 409 "Mova antes ou inative"; sem vínculo exclui; produto vinculado durante a exclusão (concorrência) não deixa órfão | API/CONC | P1 |
| O1-CAT-05 | WB-106 C5, R-27 | Nome duplicado no mesmo nível (`Calçados`/`calcados`) → erro; mesmo nome em níveis diferentes é aceito | API | P2 |
| O1-CAT-06 | WB-117 C1, C5 | Salvar cria nova versão com vigência; versões antigas consultáveis; os 3 tipos (termos do cliente, do lojista, privacidade) versionam separados; versão publicada não é editável | API | P1 |
| O1-CAT-07 | WB-117 C2 | "Mudança relevante" exige novo aceite (ver O1-CAD-21); "não relevante" não exige | E2E-M | P1 |
| O1-CAT-08 | WB-117 C3, WB-210 C5 | `/termos` e `/privacidade` abrem sem login com a versão vigente; versão com vigência futura só aparece na data (FakeClock) | E2E-W | P1 |
| O1-CAT-09 | WB-117 C4 | Texto vazio ou sem data de vigência → 422 | API | P2 |
| O1-CAT-10 | WB-117, SEC-083 | Texto com `<script>` e `<img onerror>` nas páginas públicas e no app aparece escapado (XSS armazenado) | E2E-W | P0 |
| O1-CAT-11 | WB-117 | Só super admin publica; operação → 403; auditado | API | P0 |

### 2.11 Cadastro de lojista (WB-050)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O1-LOJ-01 | WB-050 C1 | Criar conta de lojista com nome, e-mail, celular, senha e Termos do Lojista; recebe papel `merchant` | E2E-W/API | P1 |
| O1-LOJ-02 | WB-050 C2, R-08 | Cadastrar lojista com e-mail de um cliente existente **sem estar autenticado** não concede o papel nem revela a conta; o fluxo exige login (reautenticação) da conta existente | API | P0 |
| O1-LOJ-03 | WB-050 C3 | Flag desligada: "Cadastro de lojas indisponível" com lista de espera por e-mail (só grava com o consentimento WB-211 C1) | E2E-W | P1 |
| O1-LOJ-04 | WB-050 C4, SEC-008b | E-mail não confirmado não ganha o papel; confirma o código e então ganha | API | P0 |
| O1-LOJ-05 | WB-050, SEC-020 | Lojista sem loja acessa rota `/stores/{id}` de outra → 404 | API | P1 |
| O1-LOJ-06 | WB-050, A11Y | Formulário a 360 px de largura: alvos ≥ 44 px, rótulos, erros ligados ao campo, teclado por tab | A11Y | P2 |

### 2.12 Pagamento base: provedor `fake` e webhooks (WB-150, 153, 155; SEC-031..036)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O1-PAY-01 | WB-150 C1 | `fake`: criar cobrança PIX devolve string marcada TESTE e estado "pendente" (pedido AGUARDANDO_PAGAMENTO quando houver checkout, onda 4) | UNIT/INT | P1 |
| O1-PAY-02 | WB-150 C2 | Aprovar/recusar por `/v1/dev/payments/{id}/approve|reject` dispara o **mesmo** pipeline de webhook, assinado com segredo local; adulterar o segredo → 401 (prova que a assinatura é verificada de verdade) | INT | P0 |
| O1-PAY-03 | WB-150 C3, R-19 | Tokens de cartão fake: final 0000 aprova, 0001 recusa por saldo, 0002 exige 3DS, 0003 timeout; cada um produz o resultado e o evento esperados | UNIT | P1 |
| O1-PAY-04 | WB-150 C4, SEC-039 | Estorno no `fake`: total e parcial; parcial > pago − já estornado → erro; soma de estornos ≤ pago; 2 estornos parciais concorrentes que somam mais que o pago → um falha | INT/CONC | P0 |
| O1-PAY-05 | WB-150 C6 | Suíte de contrato `PaymentProvider` (criar, consultar, estornar, interpretar webhook) roda contra `fake` e contra o adaptador MP com fixtures; ambos passam | INT | P1 |
| O1-PAY-06 | WB-150, ADR-002 §9 | O `fake` expõe ganchos de teste: atraso, duplicata, divergência de valor, titular divergente, fora de ordem, reenvio (usados nas ondas 2 e 4) | INT | P1 |
| O1-PAY-07 | WB-153 C1, SEC-032 | Assinatura inválida, ausente ou malformada → 401, 0 jobs enfileirados, registro com payload mascarado; segredo de outro ambiente → 401 (C10) | API | P0 |
| O1-PAY-08 | SEC-032 | `ts` há 299 s aceito; há 301 s → 401 (FakeClock) | UNIT | P0 |
| O1-PAY-09 | SEC-032 | `data.id` do corpo diferente do da query → processa só o da query | API | P0 |
| O1-PAY-10 | SEC-032 | IPN legado `?topic=payment&id=...` sem `x-signature` → 401 | API | P0 |
| O1-PAY-11 | WB-153 C2, C7, SEC-033 | Mesma notificação (mesmo `x-request-id`) 2× → 1 job; 2ª responde 200 sem efeito; chave retida 24 h | INT | P0 |
| O1-PAY-12 | WB-153 C2, SEC-033 | 10 entregas simultâneas do mesmo evento → exatamente 1 efeito no banco | CONC | P0 |
| O1-PAY-13 | WB-153 C5, SEC-033 | `approved` depois de `refunded`, ou estorno antes da aprovação → estado final correto (ordem pela consulta ao provedor); nunca regride | INT | P0 |
| O1-PAY-14 | WB-153 C8 | Corpo com `store_id`/`user_id` de outra loja é ignorado: a re-consulta usa o token da loja gravado na tentativa de pagamento | INT | P0 |
| O1-PAY-15 | WB-153 C9, SEC-034 | Aprova só se status, `external_reference`, valor (centavos), moeda BRL, recebedor e `application_fee` batem; cada divergência isolada (valor -1 centavo, USD, outro recebedor, fee diferente, referência de outro pedido) → não aprova e gera alerta; ID desconhecido → descarta e alerta | INT | P0 |
| O1-PAY-16 | WB-153 C3, R-20 | Falha no processamento: retentativas exponenciais; esgotadas → "falhas" com payload mascarado; Redis fora na hora do webhook não perde a notificação | INT | P1 |
| O1-PAY-17 | WB-153 C4 | "Reprocessar" por financeiro/super reexecuta com a mesma idempotência e audita; suporte/operação → 403 | API | P0 |
| O1-PAY-18 | SEC-032 | Resposta 2xx em ≤ 2 s com o worker parado (só enfileira) | INT | P1 |
| O1-PAY-19 | SEC-072 | Logs do webhook sem corpo, `x-signature` e tokens | INT | P0 |
| O1-PAY-20 | SEC-046 | Cifra dos tokens OAuth: AES-256-GCM, nonce de 96 bits novo a cada cifragem, AAD = `store_id` + versão; trocar o ciphertext entre duas lojas → decifragem falha; sem a chave o backup do banco não decifra | UNIT/INT | P0 |
| O1-PAY-21 | WB-155 C1 | ADR-002 aceito pelo TL e com parecer do Security (hoje "pendente"); checklist: decisão, custos, KYC, riscos, plano B. Condição para o código de produção de pagamento | MAN | P1 |
| O1-PAY-22 | SEC-044 | Sandbox MP: PIX sem `payer.identification` é aprovado? Registrar resultado em `docs/qa/`. **Pendente: credencial do fundador** | MAN | P1 |

## 3. Exploratório (charters, 45 min cada)
| ID | Charter |
|---|---|
| E1-1 | Explorar o cadastro e a confirmação com rede ruim (3G lento, queda no envio do código, app em segundo plano ao abrir o e-mail): procurar contas duplicadas, códigos perdidos, estados presos |
| E1-2 | Explorar a sessão: duas telas e dois aparelhos, logout em um, reset em outro, relógio do aparelho adiantado/atrasado: procurar deslogar indevido ou sessão que não cai |
| E1-3 | Atacar o painel admin como um lojista malicioso: textos com HTML, URLs diretas, cookies entre hosts, convite reaproveitado |
| E1-4 | Operar o admin sob erro humano: salvar parâmetro no limite, restaurar padrão, apagar categoria em uso, perder o aparelho do TOTP |

## 4. Critérios de saída da Onda 1
1. Todos os casos P0 e P1 executáveis passam no CI; casos "diferidos" listados com a onda de destino.
2. Nenhum bug Crítico/Alto aberto; Médias com dono e prazo.
3. Cobertura da onda: `auth`, `payments/webhook`, `config` com >= 90% de linhas e >= 85% de ramos; invariantes de estratégia §5 (pagamento e autenticação) com teste.
4. SEC-001..008, 010, 011, 013-017, 036, 072, 074, 080 com evidência (saída de teste referenciada por ID de caso).
5. SEC aprova auth (sem Crítico/Alto), ADR-002 com parecer fechado (O1-PAY-21).
6. Pendências definidas pelo PO: R-02, R-03, R-06, R-07, R-08, R-11 (bloqueiam casos P0).

## 5. Fora de escopo e riscos de teste
| Item | Motivo |
|---|---|
| MP real (SEC-044, PKCE, assinatura de pagamento com token OAuth do lojista) | Sem credencial do fundador; fixtures cobrem o adaptador |
| Socket.IO (WB-219 C1-C2, SEC-014 sockets) | Gateway chega na onda 4 |
| Push e Expo Notifications | WB-190 é da onda 4 |
| Desempenho do Argon2id em Android antigo | Roda no servidor; só mede latência de login na carga (`plano-carga.md`) |
| Tempo constante (±100 ms) | Medida estatística (mediana de 30 amostras); pode ser flaky em CI lento: se o desvio do CI passar de 50 ms, usar a razão entre medianas, nunca `retry` |
