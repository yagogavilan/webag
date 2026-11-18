# Plano de teste — Onda 2 (oferta: lojista, aprovação e catálogo)

Dono: qa-engineer | Data: 2026-11-18 | Estratégia: `docs/qa/estrategia.md` | Ferramentas: ADR-006
Numeração: a do `plano-execucao.md` (Onda 2 = sub-ondas 2A e 2B = "onda 1" do backlog). Regressão da Onda 1 obrigatória (`planos/onda-1.md`, em especial auth, RBAC, auditoria, parâmetros).

**Histórias:** 2A: WB-051, 052, 218, 053, 103, 054, 104, 075. 2B: WB-055, 056, 057, 058, 059, 060, 061, 062, 063, 064, 107. Segurança: WB-225 (parte que não depende do checkout). Fora desta onda por decisão do PM/backlog: WB-065 e WB-066 (Should, onda 6) e, portanto, SEC-052/053.
**Requisitos SEC cobertos:** 008b, 014, 016, 017, 020, 021, 023 (parte da loja), 045-048, 050, 051, 062, 074, 083.
Legenda de prioridade/tipo: `estrategia.md` §7. `R-nn` = pendência em `revisao-testabilidade.md` (o caso assume o comportamento indicado). "Diferido" = depende de onda posterior; o caso já fica escrito.

## 1. Pré-condições e ambiente
- Regressão da Onda 1 verde. Compose com MinIO (storage), Mailpit, `PAYMENT_PROVIDER=fake`, host do admin separado.
- Fixtures de arquivo gerados em runtime (`estrategia.md` §4): JPG/PNG/WebP válidos, SVG renomeado `.jpg`, PDF válido, PNG 20000x20000, JPEG com EXIF/GPS, arquivos de 5 MB exatos e 5 MB + 1 byte.
- Geocodificação de CEP: provedor fake determinístico (sem rede), com coordenadas reais de Francisco Morato, Franco da Rocha, Caieiras e Campo Limpo Paulista (ADR-008).
- Builders novos: `buildStore({status})`, `buildStoreHours`, `buildProduct({variants, promo})`, `buildMerchantAccount`, `buildInvite`.
- Seed da onda 2 em `apps/api/seed/` (lojas e produtos), idempotente.

## 2. Casos

### 2.1 Onboarding: dados da loja e CPF/CNPJ (WB-051)
| ID | Origem | Caso (Dado/Quando/Então) | Tipo | P |
|---|---|---|---|---|
| O2-ONB-01 | WB-051 C1 | CPF/CNPJ com dígito verificador válido aceitos com e sem máscara; DV errado, `111.111.111-11`, tamanho errado, letras (CPF) → erro no campo | UNIT/API | P1 |
| O2-ONB-02 | WB-051 C1, R-18 | CNPJ alfanumérico (formato novo da Receita) é aceito ou recusado conforme decisão do PO; o teste existe nos dois sentidos | UNIT | P1 |
| O2-ONB-03 | WB-051 C2, HIP-031 | Documento já usado por outra loja → "Esse CPF/CNPJ já tem loja. Fale com o suporte"; `123.456.789-09` e `12345678909` são o mesmo documento (normalização) | API | P0 |
| O2-ONB-04 | WB-051 C2 | Dois lojistas cadastrando o mesmo documento ao mesmo tempo → uma loja criada, a outra recusada (constraint única) | CONC | P0 |
| O2-ONB-05 | WB-051 C3 | CEP válido autocompleta rua/bairro/cidade e grava coordenada (ponto PostGIS dentro da cidade do CEP); CEP inexistente → erro no campo; serviço de CEP fora do ar → preenchimento manual possível | INT/E2E-W | P1 |
| O2-ONB-06 | WB-051 C3, RN-03 | Cidade fora das regiões ativas: "Ainda não atendemos [cidade]" e inscrição na lista de espera só com consentimento (R-39); o rascunho não é perdido | API/E2E-W | P1 |
| O2-ONB-07 | WB-051 C4 | Abandonar na etapa 3 e voltar (outro aparelho, outra sessão) retoma na etapa 3 com "Etapa 3 de 4"; rascunho de outro usuário → 404 | E2E-W/API | P1 |
| O2-ONB-08 | WB-219 C3, WB-051 C4 | Sessão revogada no meio do preenchimento: ao entrar de novo, o rascunho está preservado | E2E-W | P1 |
| O2-ONB-09 | WB-051 C5 | CNPJ exige razão social e aceite de responsabilidade fiscal, registrado com data, versão do texto e usuário; sem aceite → 422 | API | P1 |
| O2-ONB-10 | HIP-031 | 1 CPF/CNPJ = 1 loja por conta: segunda loja do mesmo dono → 409 | API | P1 |
| O2-ONB-11 | WB-051 | Limites de campo: nome da loja, telefone/WhatsApp com máscara, endereço sem número; valores nos limites e fora (±1) | API | P2 |
| O2-ONB-12 | WB-051, A11Y | Onboarding completo a 360x640 com teclado numérico em CPF/CEP/telefone, alvos ≥ 44 px, erro ligado ao campo, navegação por tab | A11Y/E2E-W | P2 |
| O2-ONB-13 | WB-051, SEC-020 | Lojista A lê, altera ou envia a loja do lojista B (`/stores/{id}`) → 404 | API | P0 |

### 2.2 Onboarding: documentos e arquivos (WB-052, WB-218, SEC-050, 051)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O2-DOC-01 | WB-052 C1 | CPF exige RG/CNH frente e verso + comprovante; CNPJ exige cartão CNPJ + documento do responsável; enviar a loja com item faltando → 422 listando o que falta | API/E2E-W | P1 |
| O2-DOC-02 | WB-052 C1-C2, HIP-034 | JPG, PNG e PDF aceitos; 5 MB exatos aceito, 5 MB + 1 byte → 422 com motivo e reenvio possível; GIF, HTML, SVG, EXE → 422 | API | P1 |
| O2-DOC-03 | SEC-050 | SVG renomeado `.jpg` e HTML com `Content-Type: image/jpeg` → rejeitados na etapa `complete` (magic bytes), mesmo que o storage tenha aceitado o objeto | API/INT | P0 |
| O2-DOC-04 | SEC-050 | PNG de 20000x20000 (> 40 MP) → rejeitado sem travar: o worker continua processando outro job de 1 MP no mesmo minuto; processamento respeita o timeout | INT | P0 |
| O2-DOC-05 | SEC-050 | `complete` de upload de outro usuário → 404; a chave do objeto é gerada pelo servidor (cliente não escolhe); POST pré-assinado recusa corpo maior que o `content-length-range` e `Content-Type` diferente do fixado | API/INT | P0 |
| O2-DOC-06 | SEC-050 | Foto pública (logo, capa, produto): a versão servida é a re-codificada, sem EXIF/GPS (JPEG de teste com coordenadas); o original não é público | INT | P0 |
| O2-DOC-07 | WB-052 C3, SEC-051 | Documentos em bucket privado: GET anônimo no objeto → 403; sem leitura pública | INT | P0 |
| O2-DOC-08 | WB-218 C1, SEC-051 | Só admin super e operação geram URL do documento; financeiro e suporte → 403; URL de 4 min 59 s funciona, 5 min 01 s → 403 (FakeClock/MinIO) | API | P0 |
| O2-DOC-09 | WB-218 C2, SEC-074 | Cada visualização/download gera 1 linha (quem, quando, qual documento, motivo); falha ao gravar a auditoria impede a emissão da URL (falha fechada) | INT | P0 |
| O2-DOC-10 | WB-218 C3 | Dono vê a lista do que enviou (nome, tipo, data); dono da loja B pedindo documento da loja A → 404; nenhuma rota devolve documento de cliente à loja | API | P0 |
| O2-DOC-11 | WB-218 C5 | Tentativa de acesso sem permissão → 403 e alerta/registro de segurança | API | P1 |
| O2-DOC-12 | SEC-051, WB-052 C5 | Arquivo servido do domínio do storage (origem diferente do painel), `Content-Type` vindo do banco e `X-Content-Type-Options: nosniff`; PDF com JavaScript embutido não executa no painel | E2E-W/API | P0 |
| O2-DOC-13 | WB-052 C4 | Pré-visualização antes de enviar permite refazer; câmera negada → alternativa de escolher da galeria com mensagem clara | E2E-W/A11Y | P2 |
| O2-DOC-14 | WB-052 | Upload com rede 3G lenta e queda no meio: indicador de progresso, retomar sem duplicar objeto, nunca "enviado" sem `complete` | E2E-W (throttling) | P2 |
| O2-DOC-15 | WB-218 C4, HIP-035, R-28 | Loja reprovada: documentos apagados no dia 90 (89 ainda existem). Diferido (onda 6, WB-215) | INT (FakeClock) | P2 |
| O2-DOC-16 | WB-052 | Reenvio de documento reprovado substitui o anterior e mantém histórico para auditoria (R-28); envio de tipo repetido não acumula lixo | API | P2 |

### 2.3 Onboarding: conta de recebimento e OAuth (WB-053, WB-155, SEC-045, 046, 047, 048)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O2-PGT-01 | WB-053 C1, SEC-045 | Dono com senha digitada há ≤ 5 min inicia a conexão e conclui com `fake`: "Conta conectada"; senha de 5 min 01 s → 403 `reauth_required`; funcionário → 403 | API/E2E-W | P0 |
| O2-PGT-02 | WB-053 C6, SEC-045 | Callback com `state` de outra sessão → 400, nada gravado; `state` reutilizado → 400; `state` com 10 min 01 s → "Link expirado. Conecte de novo"; `state` de outra loja do mesmo usuário → 400; sem `state` → 400 | API (FakeClock) | P0 |
| O2-PGT-03 | SEC-045 | `redirect_uri` vem da configuração: parâmetro `redirect_uri` na requisição é ignorado; `state` com 256 bits aleatórios guardado no servidor | API/UNIT | P0 |
| O2-PGT-04 | SEC-045 | PKCE S256 se o MP suportar (a verificar no sandbox). **Pendente: fundador** | MAN | P1 |
| O2-PGT-05 | WB-053 C2 | OAuth negado (`error=access_denied`) ou conta sem nível exigido: motivo e como resolver; etapa continua pendente; nada vinculado | API | P1 |
| O2-PGT-06 | WB-053 C4, SEC-048 | Dados de recebimento só ao dono e mascarados; trocar/desconectar exige senha ≤ 5 min, envia e-mail de aviso ao dono (Mailpit), grava auditoria e alerta o admin; funcionário → 403 | API/INT | P0 |
| O2-PGT-07 | WB-053 C5 | Com `fake`, a etapa conclui com "Conta de teste conectada" | E2E-W | P1 |
| O2-PGT-08 | WB-053 C7, SEC-047, DEC-020e, R-01 | `fake` com titular de CPF/CNPJ diferente da loja: conexão fica "Em análise", loja **não** pode vender/publicar, admin alertado; admin libera com motivo (auditado) | INT/E2E-W | P0 |
| O2-PGT-09 | SEC-046 | Tokens OAuth: coluna cifrada (AES-256-GCM, nonce único); trocar o ciphertext entre duas lojas → falha de decifragem; tokens ausentes de logs, DTOs, auditoria e exportação (grep) | INT | P0 |
| O2-PGT-10 | WB-155 C2 | Job diário renova tokens que vencem em < 30 dias (FakeClock); token com 31 dias não é tocado | INT | P1 |
| O2-PGT-11 | WB-155 C3 | Token revogado/irrenovável: loja passa a "Conexão com pagamento pendente", deixa de ser visível para novos pedidos e o lojista é avisado (e-mail) | INT | P0 |
| O2-PGT-12 | WB-155 C2, DEC-016 | Não existe rota nem serviço que retenha, ajuste ou desconte valor do lojista depois do pagamento no modo split (varredura do OpenAPI) | API | P1 |
| O2-PGT-13 | WB-053 C3, R-37 | Modo centralizado (fallback): titular diferente bloqueia o envio; só ativável com parecer registrado. Diferido (só `fake`) | API | P2 |
| O2-PGT-14 | R-37 | Duplo toque em "Conectar" gera 1 `state` ativo; mesma conta MP vinculada a duas lojas é tratada conforme o PO | API/CONC | P1 |
| O2-PGT-15 | SEC-048, WB-225 C4 | Conta trocada há 3 dias entra no alerta de risco; há 8 dias não | INT (FakeClock) | P2 |

### 2.4 Aprovação de lojas: fila, decisão e acompanhamento (WB-103, 104, 054)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O2-APR-01 | R-29 | Máquina de estados da loja (rascunho, em análise, aprovada, reprovada, suspensa): toda transição válida passa e **toda inválida falha** (ex.: aprovar rascunho, reaprovar aprovada, suspender reprovada); tabela completa | UNIT | P0 |
| O2-APR-02 | WB-103 C1, HIP-030, R-15 | Fila só com "Em análise", ordenada pela data de envio; destaque vermelho após 2 dias úteis: enviada sexta 17:00 passa a atrasada na terça 17:00, não no domingo (FakeClock, `America/Sao_Paulo`) | UNIT/E2E-W | P1 |
| O2-APR-03 | WB-103 C2 | Abrir a loja mostra dados, documentos (URL curta, acesso auditado) e a checagem de duplicidade de CPF/CNPJ | E2E-W | P1 |
| O2-APR-04 | WB-103 C3, WB-054 C2 | Aprovar: loja vira APROVADA, lojista recebe e-mail (Mailpit) e notificação; só aparece ao cliente com conta de recebimento ativa + 1 produto ativo (RN-03) | INT/E2E-W | P0 |
| O2-APR-05 | WB-103 C3, WB-054 C3 | Reprovar exige motivo por item (um motivo em branco → 422); lojista vê os motivos, corrige só os itens reprovados, reenvia e volta a "Em análise" sem refazer o resto | E2E-W | P0 |
| O2-APR-06 | WB-103 C4 | Dois admins decidem a mesma loja ao mesmo tempo → exatamente uma decisão; a outra recebe 409 "Já decidida por [nome]" | CONC | P0 |
| O2-APR-07 | WB-103 C5 | Fila vazia: "Nenhuma loja aguardando" | comp | P3 |
| O2-APR-08 | WB-103, SEC-021 | Aprovar/reprovar: só super e operação; financeiro e suporte → 403; decisão auditada (antes/depois) | API | P0 |
| O2-APR-09 | WB-054 C1 | Envio muda para "Em análise" com "Respondemos em até 2 dias úteis" (texto vem do parâmetro SLA, não fixo) | E2E-W | P2 |
| O2-APR-10 | WB-054 C4 | Loja aprovada sem produto ativo mostra "Cadastre 1 produto para aparecer no app" e não aparece na API pública | E2E-W/API | P1 |
| O2-APR-11 | RN-03, HIP-030 | `isStoreVisible`: tabela com cada critério desligado isoladamente (não aprovada, suspensa, conta de recebimento inativa, 0 produto ativo) → invisível; todos ligados → visível | UNIT/INT | P0 |
| O2-APR-12 | WB-104 C1, R-24 | Suspender com motivo (obrigatório): loja some da API pública na hora, novos pedidos recusados (diferido, onda 4), lojista notificado; painel do lojista mostra "Loja suspensa" e permite ler o que já existe | API/E2E-W | P0 |
| O2-APR-13 | WB-104 C2 | Reativar: volta a ser visível só se RN-03 continuar atendida (ex.: sem produto ativo → continua invisível) | INT | P1 |
| O2-APR-14 | WB-104 C3 | Editar qualquer dado da loja pelo admin grava antes/depois na auditoria; suporte → 403 | API | P0 |
| O2-APR-15 | WB-104 C4-C5 | Suspensão não apaga saldo/dívida (diferido, onda 4) e "Em risco" com suspensão em um toque (diferido, onda 6 com WB-198) | API | P2 |
| O2-APR-16 | WB-104 | Lojista cuja loja foi suspensa não consegue reativar sozinho (rota do lojista → 403) nem editar horários para forçar visibilidade | API | P0 |

### 2.5 Equipe e permissões (WB-075, SEC-014, 016, 017, 020)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O2-EQP-01 | WB-075 C1, SEC-017 | Convite: token de 256 bits só com hash no banco, ligado ao e-mail, válido 7 dias: 6 d 23 h ok; 7 d 1 min → 410; usado 2× → 410; revogado → 410; aberto por outro e-mail → 410 | API (FakeClock) | P0 |
| O2-EQP-02 | WB-075 C1 | Convite marca permissões entre pedidos, catálogo/estoque, trocas, cupons, avaliações; permissão inexistente → 422 | API | P1 |
| O2-EQP-03 | WB-075 C2, RN-13 | Matriz gerada da tabela única: funcionário com cada permissão (e sem nenhuma) × cada rota da loja: financeiro, conta de recebimento, equipe e configurações → 403 sempre; rota de catálogo só com `catalog` | API | P0 |
| O2-EQP-04 | WB-075 C3, SEC-014, WB-219 C2 | Remover funcionário: access e refresh dele → 401 em até 5 s e a próxima requisição com o access antigo → 401; socket e sala `store:{id}`: diferido (onda 4) | INT | P0 |
| O2-EQP-05 | WB-075 C4, R-09 | E-mail já membro de outra loja → erro; a resposta não deve revelar se o e-mail tem conta na Webag (mesma mensagem para qualquer e-mail já vinculado) | API | P1 |
| O2-EQP-06 | WB-075 C5 | Alterar permissões vale na próxima requisição; entra no log da loja (quem, quando, antes/depois) | API/INT | P1 |
| O2-EQP-07 | WB-075, SEC-016 | Convidar, remover ou alterar permissões sem senha digitada há ≤ 5 min → 403 `reauth_required`; funcionário tentando convidar → 403 | API | P0 |
| O2-EQP-08 | WB-075, SEC-008b | Convite aceito por conta com e-mail não confirmado → 403 até confirmar (R-09: conta criada pelo link do convite nasce confirmada?) | API | P0 |
| O2-EQP-09 | SEC-020 | Funcionário da loja A acessa pedidos, produtos ou documentos da loja B → 404; dono da loja A idem | API | P0 |
| O2-EQP-10 | WB-075, R-09 | Dono não consegue remover a si mesmo nem o último dono; reenviar convite para e-mail já convidado invalida o anterior | API | P1 |
| O2-EQP-11 | WB-075 C1, A11Y | Tela de convite com marcação de permissões: rótulos, estado por texto (não só cor), uso por teclado | A11Y | P2 |

### 2.6 Perfil, horários e pausa (WB-055, 056)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O2-PRF-01 | WB-055 C1 | Logo quadrada e capa 16:9: recorte e compressão no navegador, origem 4,9 MB gera arquivo ≤ 300 KB com prévia; origem 5,1 MB → recusada com motivo | E2E-W | P1 |
| O2-PRF-02 | WB-055 C1, SEC-050 | Cliente adulterado envia 6 MB, proporção errada ou SVG direto à API → rejeitado no servidor (a validação do navegador não é a barreira) | API | P0 |
| O2-PRF-03 | WB-055 C2 | Descrição 300 caracteres ok, 301 → 422 (contagem por caractere Unicode, `ã` e emoji contam 1); 1 categoria principal + até 2 extras ativas: 3 extras, 0 principal ou categoria inativa → 422 | API | P1 |
| O2-PRF-04 | WB-055 C3 | WhatsApp com máscara, normalizado; número inválido → 422; vira link `wa.me/55...` correto | API/UNIT | P1 |
| O2-PRF-05 | WB-055 C4, R-23 | Alterar nome ou CPF/CNPJ após aprovação reabre análise; demais campos publicam na hora; auditado | API/E2E-W | P1 |
| O2-PRF-06 | WB-055 C5 | MinIO parado: "Não foi possível enviar. Tentar de novo" e a imagem anterior permanece | E2E-W | P1 |
| O2-PRF-07 | SEC-083 | Descrição e nome com `<script>`/`<img onerror>` aparecem como texto no admin e no painel do lojista | E2E-W | P0 |
| O2-PRF-08 | RN-13 | Perfil, horários, entrega, retirada e trocas só pelo dono (funcionário → 403); loja alheia → 404 | API | P0 |
| O2-HOR-01 | WB-056 C1 | Cada dia: fechado ou até 2 intervalos; fim ≤ início → 422; intervalos sobrepostos → 422; 3º intervalo → 422 | API | P1 |
| O2-HOR-02 | RN-03, R-16 | `isOpenNow` em tabela (FakeClock em UTC, loja em `America/Sao_Paulo`): 08:59:59 fechada, 09:00:00 aberta, 12:00:00 conforme regra de limite (R-16), pausa entre 12:00-14:00, 23:30 UTC (20:30 local) | UNIT | P0 |
| O2-HOR-03 | WB-056 C2 | Feriado marcado: "Fechada hoje"; feriado do dia anterior ou seguinte não afeta | UNIT | P1 |
| O2-HOR-04 | WB-056 C3-C4 | Pausar 30 min, 1 h, 2 h, até o fim do dia ou até reabrir: loja vira "Fechada" na hora; reabre sozinha no fim do prazo (+1 s); "até reabrir" só reabre por ação | UNIT/INT | P0 |
| O2-HOR-05 | WB-056 C5 | Ao chegar a hora de fechar, `isOpenNow` passa a falso; pedido já aceito segue (diferido, onda 4) | UNIT | P1 |
| O2-HOR-06 | WB-056 C6, R-16 | 3 h aberta sem interação e sem pedido aceito → 1 e-mail "Sua loja está aberta e ninguém respondeu"; não repete a cada hora; interação zera o relógio | INT (FakeClock) | P2 |
| O2-HOR-07 | WB-056, A11Y | Editor de horários a 360 px: seletor de hora utilizável com uma mão, estado "Fechado" por texto, teclado | A11Y/E2E-W | P2 |

### 2.7 Entrega, retirada e política de trocas (WB-057, 058, 059; RN-04)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O2-ENT-01 | WB-057 C1 | Raio: 1 e 15 ok; 0,9 e 15,01 → 422 com o limite; mudar `raio_max_km` para 20 passa a aceitar 20; padrão de loja nova = 5 | API | P1 |
| O2-ENT-02 | WB-057 C2 | Taxa fixa R$ 0,00 e R$ 50,00 ok; R$ 50,01 e negativa → 422; valor em centavos inteiros | API | P1 |
| O2-ENT-03 | WB-057 C2, RN-04, R-17 | Taxa por distância: 5 faixas contíguas ok; com lacuna (0-2, 3-5) ou sobreposição (0-3, 2-5) → "As faixas precisam ser seguidas"; 6 faixas → 422; última faixa que não termina no raio → 422 | API/UNIT | P0 |
| O2-ENT-04 | RN-04, R-17 | `deliveryFee(distância)` em tabela: 0,0 km, exatamente na fronteira entre faixas (2,00 km), 4,99 km, exatamente no raio, 0,01 km acima do raio (sem entrega) | UNIT | P0 |
| O2-ENT-05 | RN-03, ADR-008 | Distância calculada no banco (PostGIS) confere com haversine independente (tolerância 0,5%) para 10 pares reais da região; endereço a 4,99 km entra e a 5,01 km sai com raio 5 | INT | P0 |
| O2-ENT-06 | WB-057 C3, RN-04 | Pedido mínimo e grátis acima de X: X ≤ mínimo → 422; com subtotal = X → frete 0; subtotal = X − 1 centavo → frete cobrado; a comparação usa o subtotal antes de cupom e frete | UNIT | P0 |
| O2-ENT-07 | WB-057 C4 | Tempo estimado: mínimo < máximo (igual → 422), máximo ≤ 1.440; 1.441 → 422; exibido sem recálculo | API | P2 |
| O2-ENT-08 | WB-057 C5 | "Prévia" com endereço de teste devolve exatamente a taxa que a função do checkout calcula (mesma função; teste de paridade com 5 endereços) | INT | P1 |
| O2-ENT-09 | WB-057 C6 | Desativar entrega só se a retirada estiver ativa; nenhuma opção ativa → 422; desativar as duas em duas abas ao mesmo tempo deixa pelo menos uma | API/CONC | P1 |
| O2-ENT-10 | WB-057, R-17 | Reduzir o raio abaixo da última faixa existente é recusado ou reajusta conforme decisão do PO; não deixa faixas fora do raio | API | P1 |
| O2-RET-01 | WB-058 C1 | Ativar retirada: endereço (padrão o da loja), instruções 200 ok/201 → 422, tempo de preparo mínimo < máximo | API | P1 |
| O2-RET-02 | WB-058 C2 | Desativar remove a opção para novos pedidos; pedidos de retirada em andamento seguem (diferido, onda 4) | API | P1 |
| O2-RET-03 | WB-058 C3, HIP-040, SEC-025 | Gerador do código: 4 dígitos (parâmetro 4-6), zeros à esquerda preservados, `crypto` (não sequencial), não serve de chave de acesso ao pedido | UNIT | P1 |
| O2-TRC-01 | WB-059 C1 | Prazo voluntário 1 e 30 ok; 0 e 31 → 422 quando "aceito troca"; taxa de coleta R$ 0 a R$ 30 (3000 ok, 3001 → 422); com `taxa_coleta_max_cents`=5000 aceita 5000 | API | P1 |
| O2-TRC-02 | WB-059 C2, DEC-011 | Desligar a troca voluntária: aviso "Arrependimento (7 dias) e defeito continuam valendo por lei" e prazo voluntário = 0; a API **não** tem campo para desligar arrependimento/defeito (payload com esse campo → 400); a UI não oferece o controle | API/E2E-W | P0 |
| O2-TRC-03 | WB-059 C3 | A política é versionada para o snapshot no pedido: alterar a política não muda a versão referenciada por pedido já existente (diferido, onda 4) | INT | P1 |
| O2-TRC-04 | WB-059, R-26 | Religar a troca voluntária volta ao prazo padrão (7) ou ao último, conforme decisão | API | P2 |

### 2.7 Catálogo: produto, variações, estoque e preço (WB-060, 061, 062, 063, 064)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O2-PRD-01 | WB-060 C1 | Criar com nome (80 ok/81 → 422), descrição (1.000 ok/1.001 → 422), categoria ativa, preço, foto principal e ≥ 1 variação ou "sem variação" com estoque; categoria inativa → 422 | API | P0 |
| O2-PRD-02 | WB-060 C1, R-38 | Rascunho salva sem os obrigatórios de publicação e não aparece em nenhuma rota pública; publicar rascunho incompleto → 422 por campo | API | P1 |
| O2-PRD-03 | WB-060 C3, RN-05 | Preço: R$ 0,01 ok; R$ 0,00 e R$ 100.000,00 → 422; R$ 99.999,99 ok; a UI converte `19,90`, `1.234,56` e `5` para centavos corretos e recusa `19,999` | UNIT/API | P0 |
| O2-PRD-04 | WB-060 C2 | Até 8 fotos (9ª → 422); resultado ≤ 300 KB e lado maior ≤ 1.600 px; primeira é a capa; reordenar (arrastar **e** alternativa por teclado/botões) muda a ordem | E2E-W/A11Y | P1 |
| O2-PRD-05 | WB-060 C4 | Publicar → ATIVO e visível se a loja estiver visível; "Pausar" tira da API pública sem apagar | API | P0 |
| O2-PRD-06 | WB-060 C5, RN-06 | Excluir com pedido em andamento → 409 "Há pedidos em andamento"; sem pedidos → arquivado e o histórico de pedidos antigos mantém nome e preço (snapshot) | INT | P0 |
| O2-PRD-07 | WB-060 C6, WB-107 C3, R-12 | Produto de categoria/palavra proibida: comportamento conforme decisão (bloquear no cadastro ou entrar em "Revisar"); os dois caminhos testados | API | P1 |
| O2-PRD-08 | WB-060, SEC-020 | Editar, pausar ou excluir produto de outra loja → 404; funcionário só com `catalog` (sem → 403) | API | P0 |
| O2-PRD-09 | WB-060, SEC-083 | Nome e descrição com HTML/script aparecem como texto (lojista e admin) | E2E-W | P0 |
| O2-PRD-10 | WB-060 | Duplo clique em "Publicar" cria 1 produto; perda de rede no envio das fotos não deixa produto "ativo" sem foto | E2E-W | P1 |
| O2-VAR-01 | WB-061 C1 | Até 3 atributos e 100 combinações: 100 ok, 101 → 422 (5x5x5 = 125 → 422); estoque inteiro ≥ 0: -1, 1,5 e `abc` → 422; limite superior conforme R-25 | API | P0 |
| O2-VAR-02 | WB-061 C2 | Combinação duplicada → "Essa combinação já existe", inclusive `P` x `p` e `Azul` x `Azul ` | API | P1 |
| O2-VAR-03 | WB-061 C3, RN-03 | Estoque 0 → "Esgotado"; todas as variações esgotadas → o produto sai de ofertas e busca, mas continua na página da loja como "Indisponível" (`isProductVisible` em tabela) | UNIT/API | P0 |
| O2-VAR-04 | WB-061 C4, RN-06 | Reduzir estoque abaixo do reservado → 409 "X unidades estão reservadas em pedidos" (reservado 3: ajustar para 2 falha, para 3 passa) | INT | P0 |
| O2-VAR-05 | RN-06 | Ajuste de estoque concorrente com reserva de pedido: nunca `disponível < 0`; resultado final consistente (`FOR UPDATE`) | CONC | P0 |
| O2-VAR-06 | RN-06, SEC-030 | Domínio de estoque: estoque 5 e 20 reservas simultâneas → exatamente 5 sucessos, 15 recusas com "Acabou o estoque"; propriedade: qualquer sequência aleatória de reservar/liberar/baixar/ajustar nunca gera disponível negativo (executa quando `reserve()` existir) | CONC/PROP | P0 |
| O2-VAR-07 | WB-061 C5 | Preço da variação vazio usa o do produto; preenchido sobrepõe só aquela variação | UNIT | P1 |
| O2-VAR-08 | WB-061, R-25 | Excluir/alterar variação com reserva ativa → 409; SKU duplicado na mesma loja conforme decisão | API | P1 |
| O2-PRC-01 | WB-062 C1, RN-05 | `effectivePrice(now)` em tabela: antes do início, no instante do início, dentro, no instante do fim (regra R-13), depois; borda de fuso (23:59:59 BRT = 02:59:59 UTC do dia seguinte) | UNIT | P0 |
| O2-PRC-02 | WB-062 C2 | Promocional ≥ normal, fim < início, promocional R$ 0,00 → 422; promocional = normal − 1 centavo ok | API | P1 |
| O2-PRC-03 | WB-062 C3 | Fim da promoção: 1 s depois o preço servido é o normal sem job nem ação (cálculo na leitura) | UNIT/API | P0 |
| O2-PRC-04 | WB-062, RN-05 | Subir o preço normal acima da promoção vigente ok; baixar o normal abaixo ou igual à promoção vigente → 422 | API | P1 |
| O2-PRC-05 | WB-062 C1 | Percentual exibido "de/por": 33,33% → 33%, 0,4% → "0%" não é exibido (regra de arredondamento definida no PO) | UNIT | P3 |
| O2-PRC-06 | WB-062 C4 | Alterar preço com carrinho aberto avisa no checkout. Diferido (onda 4, WB-023 C5) | E2E-M | P1 |
| O2-SEC-01 | WB-063 C1-C4 | Seções (Should): nome ≤ 40, ordem das seções e dos produtos; produto sem seção em "Outros"; seção sem produto ativo não aparece; excluir seção manda os produtos para "Outros" | API | P2 |
| O2-EST-01 | WB-064 C1 | Pausar/reativar com 1 toque e o status refletido na lista; produto pausado fora da API pública | E2E-W | P1 |
| O2-EST-02 | WB-064 C2, HIP-033, R-14 | Selo "Baixo" quando `disponível ≤ estoque_baixo_un` (3 → baixo, 4 → não); notificação 1× por variação: 3 (envia), 2 (não), sobe para 10 (rearma), volta a 3 (envia de novo); limite por loja de 0 a 100 | UNIT | P1 |
| O2-EST-03 | WB-064 C3 | Ajuste rápido (+/-): dois toques "+1" simultâneos resultam em +2 (usa delta/versão, sem perda de atualização) ou 409 claro; nunca +1 silencioso | CONC | P0 |
| O2-EST-04 | WB-064 C3 | Ajuste que deixaria estoque abaixo do reservado mostra o motivo; falha de rede reverte o valor exibido | E2E-W | P1 |

### 2.8 Moderação de produtos (WB-107)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O2-MOD-01 | WB-107 C1 | Lista com filtros por loja, categoria, data; "Remover" e "Pausar" exigem motivo (sem motivo → 422); filtro "denunciados" diferido (onda 6) | API/E2E-W | P1 |
| O2-MOD-02 | WB-107 C2 | Remover: sai da API pública; lojista notificado com o motivo (e-mail); histórico preservado; **o lojista não consegue reativar** produto removido ou pausado pelo admin (403/409) | API | P0 |
| O2-MOD-03 | WB-107 C3, R-12 | Palavras proibidas (editável): `ARMA` e `arma` casam; `carma` e `armário` conforme a regra de correspondência (R-12); produto novo que casar entra em "Revisar" sinalizado e **não** é bloqueado; editar a lista não altera produtos antigos | UNIT/API | P1 |
| O2-MOD-04 | WB-107 C4 | 3 remoções em 30 dias → loja sinalizada para análise de suspensão; 2 remoções ou 3 em 31 dias → não (FakeClock) | INT | P1 |
| O2-MOD-05 | WB-107, SEC-021 | Só super e operação moderam; financeiro, suporte e lojista → 403; remoção auditada | API | P0 |

### 2.9 Loja nova e limite de exposição (WB-225, SEC-062)
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O2-NOV-01 | WB-225 C1, C5, R-10 | `isNewStore`: aprovada há 29 dias com 25 pedidos ENTREGUE, há 31 com 10 e há 31 com 25 pedidos; a regra "o que durar mais" é testada nas 3 combinações; limite cai para `pedido_max_cents` global só quando as duas condições acabam | UNIT | P0 |
| O2-NOV-02 | WB-225 C2 | Painel do lojista mostra "Loja nova: pedidos de até R$ 500,00 até [data/pedidos]"; admin libera antes (motivo obrigatório, auditado) ou ajusta o limite por loja; lojista não altera | E2E-W/API | P1 |
| O2-NOV-03 | WB-225, RN-02 | Parâmetros editáveis dentro da faixa (dias 7-90, pedidos 5-100, valor ≥ R$ 100,00); fora → 422 | API | P1 |
| O2-NOV-04 | WB-225 C1, SEC-062, R-10 | Checkout de R$ 500,00 aceito e R$ 500,01 → 422 com mensagem ao cliente e carrinho mantido; base do limite (subtotal ou total com frete) conforme R-10. Diferido (onda 4) | API | P0 |
| O2-NOV-05 | WB-225 C3, C6 | Alerta "Loja em risco" (não recebi > 5% ou cancelamento > 15%, mínimo 10 pedidos) e contagem de pedidos barrados. Diferido (ondas 4 e 6) | INT | P1 |

### 2.10 Ponta a ponta, seed, migração e transversais da onda
| ID | Origem | Caso | Tipo | P |
|---|---|---|---|---|
| O2-E2E-01 | critério de saída, WB-050, 051, 052, 053, 103, 054 | **Cadastrar e aprovar loja (caminho feliz):** lojista cria conta, confirma o código (lido no Mailpit), faz as 4 etapas, envia documentos, conecta a conta `fake`, envia; admin entra com TOTP, abre a fila, vê documentos, aprova; lojista vê "Aprovada" e o e-mail chega | E2E-W | P0 |
| O2-E2E-02 | WB-103 C3, WB-054 C3 | **Reprovar e reenviar:** admin reprova com motivo por item; lojista corrige só o item; reenvia; admin aprova | E2E-W | P0 |
| O2-E2E-03 | WB-060, 061, 062, RN-03 | **Publicar produto:** com loja aprovada e conta ativa, lojista cria produto com 3 variações, foto e promoção; a loja e o produto aparecem na API pública e some quando o produto é pausado | E2E-W | P0 |
| O2-E2E-04 | WB-104, WB-107 | **Moderar:** admin suspende a loja (some da API pública) e remove um produto (lojista vê o motivo) | E2E-W | P1 |
| O2-SEG-01 | SEC-020 | Matriz BOLA regenerada com as rotas novas (lojas, documentos, produtos, variações, equipe, convites, conta de recebimento, pausa): 404 em 100% das rotas com `{id}` para recurso de outra loja | API | P0 |
| O2-SEG-02 | SEC-021 | Matriz perfil × rota regenerada: cliente, dono, funcionário com cada permissão, 4 admins × rotas novas, contra a tabela única | API | P0 |
| O2-SEG-03 | SEC-022 | DTOs de loja e produto rejeitam `status`, `storeId` do recurso, `commission`, `approvedAt`, `ownerId`, `price` em campo de moderação | API | P0 |
| O2-SEG-04 | SEC-074 | Cada ação da onda (aprovar, reprovar, suspender, reativar, editar loja, remover produto, ver documento, trocar conta MP, convidar/remover equipe) gera 1 linha de auditoria | INT | P0 |
| O2-SEG-05 | SEC-023 | Nenhuma resposta de loja/produto devolve e-mail, CPF ou telefone do cliente; CPF/CNPJ da loja mascarado para quem não é dono/admin | API | P0 |
| O2-DAT-01 | ADR-006, plano §1 | Migrações: banco vazio → todas as migrações aplicam; banco da onda 1 com dados → migrações da onda 2 aplicam sem perda; rodar duas vezes é idempotente | INT | P0 |
| O2-DAT-02 | critério de saída | Seed da onda 2 carrega e é idempotente (2 execuções, mesma contagem): lojas em estados distintos (aberta, fechada, pausada, em análise, suspensa, sem troca), produtos com variações, esgotados, promoção vigente e vencida; todos os invariantes RN-03/RN-05/RN-06 valem sobre o seed | INT | P1 |
| O2-A11Y-01 | brief §5 | Painel do lojista (onboarding, catálogo, horários) a 360x640 e 1366x768: contraste ≥ 4,5:1, rótulos em todos os campos, foco visível, alvo ≥ 44 px, zoom de 200% sem perda; axe-core sem violação Séria/Crítica | A11Y | P2 |
| O2-PERF-01 | brief §5 | Painel em 3G lento (400 kbps, 400 ms): lista de produtos com 100 itens carrega em ≤ 4 s e permanece utilizável durante o carregamento de imagens (skeleton) `[HIPÓTESE de orçamento]` | PERF | P2 |
| O2-UX-01 | brief §5 | Todas as telas novas têm os estados carregando, vazio, erro e sem conexão (checklist por tela com captura) | MAN | P1 |

## 3. Exploratório (charters, 45 min cada)
| ID | Charter |
|---|---|
| E2-1 | Fazer o onboarding no celular com rede ruim, trocando de aba, abrindo o e-mail e voltando: procurar rascunho perdido, upload duplicado, etapa pulada |
| E2-2 | Agir como lojista malicioso: HTML em todos os campos de texto, IDs de outra loja nas URLs, convite reaproveitado, arquivos disfarçados, URL de documento depois de 5 minutos |
| E2-3 | Agir como admin sobrecarregado: aprovar duas lojas em duas abas, suspender e reativar rápido, remover produto com a loja pausada |
| E2-4 | Cadastrar 20 produtos reais de uma loja de roupas (variações P/M/G x 3 cores, promoções, estoque 0): medir fricção, toques e palavras; ver `roteiros-usabilidade.md` |

## 4. Critérios de saída da Onda 2
1. O2-E2E-01 a 03 verdes no Playwright (condição do plano de execução); P0 e P1 executáveis verdes no CI; diferidos listados com a onda de destino.
2. Documentos protegidos e upload validado: O2-DOC-03 a 12 verdes (evidência para o Security).
3. Seed da onda 2 carrega (O2-DAT-02) e migrações idempotentes (O2-DAT-01).
4. Cobertura: `catalog/stock` ≥ 90% de linhas e ≥ 85% de ramos; invariantes de estoque (O2-VAR-04 a 06, O2-EST-03) com teste de concorrência.
5. Nenhum bug Crítico/Alto aberto; regressão da Onda 1 verde.
6. Definições pendentes do PO que bloqueiam P0: R-01, R-09, R-10, R-12, R-29.

## 5. Fora de escopo e riscos de teste
| Item | Motivo |
|---|---|
| Planilha e ação em massa (WB-065/066, SEC-052/053) | Onda 6 |
| Socket de equipe (SEC-014 parte tempo real) e pedido real | Onda 4 |
| Visibilidade na busca e home (PostGIS no app) | Onda 3; aqui só a função de visibilidade e a distância |
| Serviço de CEP real | Rede de terceiros; provedor fake no teste; troca de provedor é validação manual do fundador |
| MP real e KYC | Sem credencial; `fake` |
| Fidelidade visual ao design | Revisão do Designer; QA verifica estados e acessibilidade |
