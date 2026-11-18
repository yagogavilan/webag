# PRD: LGPD e Privacidade

Status: pronto para G3; **threat model e parecer jurídico pendentes** | Dono: product-owner | Data: 2026-11-18 | Histórias: WB-210 a WB-218
Regras: RN-14, HIP-022 a HIP-026, HIP-035, HIP-036. Origem: brief §3.1 (exportar e excluir), §6 (LGPD). Não sou advogado: pontos marcados `[validar]` vão ao `security-engineer` e ao fundador/jurídico.

## Problema
O Webag trata dados pessoais de clientes (nome, e-mail, celular, endereço, localização, CPF no pagamento), de lojistas (documentos, dados bancários) e de terceiros (fotos de troca). A LGPD, a Apple (5.1.1(v)) e o Google Play exigem consentimento onde cabe, direitos do titular, exclusão de conta e política clara. Sem isso, G5 (publicação) não passa. Frequência: toda interação.

## Objetivo e métrica de sucesso
Cumprir a LGPD no que o produto controla e passar na revisão das lojas na 1ª submissão.
| Métrica | Meta |
|---|---|
| Solicitações de exportação atendidas no prazo (24 h; legal 15 dias) | 100% |
| Solicitações de exclusão atendidas em <= 15 dias | 100% |
| Dados pessoais nos logs de aplicação | 0 (varredura) |
| Telas que coletam dado sem finalidade registrada | 0 |
| Rejeição de loja de apps por privacidade/exclusão | 0 |

**Eventos (auditados, sem dado pessoal):** `consent_given/revoked {type, version}`, `data_export_requested/ready`, `account_deletion_requested/completed`, `privacy_request_opened`, `sensitive_data_accessed`.

## Fora do escopo (1.0)
Perfil de crianças e adolescentes (HIP-026: 18+); transferência internacional customizada (só provedores de nuvem/push já contratados, a documentar); decisões automatizadas com efeito jurídico (nenhuma na 1.0); DPO terceirizado (o fundador é o encarregado inicial `[validar]`); certificações (ISO 27701); portal público de transparência.

## Usuários e cenários
Carla pede para excluir a conta; pede cópia dos dados; recusa marketing. Seu Marcos envia documentos e quer saber como são guardados. Yago responde à solicitação de um titular em 15 dias.

## Requisitos funcionais
| ID | Requisito | Histórias |
|---|---|---|
| RF-LGP-01 | Termos e política versionados, aceite registrado | 210, WB-117 |
| RF-LGP-02 | Consentimentos granulares e revogáveis | 211, WB-196 |
| RF-LGP-03 | Exportação dos dados do titular | 212 |
| RF-LGP-04 | Exclusão de conta: no app e pela web | 213, 214 |
| RF-LGP-05 | Retenção, anonimização e inventário de tratamento | 215 |
| RF-LGP-06 | Minimização perante o lojista | 216, RN-14 |
| RF-LGP-07 | Canal do titular e encarregado | 217 |
| RF-LGP-08 | Proteção de documentos de loja (acesso registrado) | 218 |

## Regras de negócio
**Inventário de tratamento (insumo do registro de operações, art. 37)**

| Dado | Titular | Finalidade | Base legal `[validar]` | Retenção |
|---|---|---|---|---|
| Nome, e-mail, celular, senha (hash) | Cliente, lojista | Conta e comunicação do pedido | Execução de contrato (art. 7, V) | Enquanto a conta existir; anonimiza na exclusão |
| Endereço e localização | Cliente | Entrega, filtro de lojas | Execução de contrato; localização precisa: consentimento (permissão do SO) | Endereço: conta; localização GPS: não é guardada além da sessão, só o endereço escolhido |
| CPF (pagador) | Cliente | Exigência do provedor de pagamento | Execução de contrato; obrigação legal | Criptografado; 5 anos se vinculado a pagamento (fiscal) |
| Pedidos, valores, pagamento | Cliente, lojista | Execução, fiscal, estorno | Contrato; obrigação legal (art. 7, II) | `retencao_fiscal_anos` (5) |
| Fotos de troca | Cliente | Análise da troca | Contrato | 180 dias após conclusão `[HIPÓTESE]` |
| Documentos de loja (RG/CNH, comprovante, cartão CNPJ) | Lojista | Verificação e prevenção a fraude | Legítimo interesse / obrigação legal `[validar]` | Loja ativa: enquanto ativa + 5 anos; reprovada: 90 dias (HIP-035) |
| Token de push, ID do dispositivo | Usuário | Notificação | Contrato (transacional); consentimento (marketing) | Até logout/exclusão |
| Registros de acesso (IP, data) | Usuário | Segurança, Marco Civil | Obrigação legal (art. 15 MCI) | 6 meses (HIP-035) |
| Consentimentos | Usuário | Prova | Obrigação/legítimo interesse | Prazo prescricional `[validar]` |
| Log de auditoria admin | Admin | Segurança | Legítimo interesse | 5 anos |
| Lista de espera (e-mail, bairro) | Visitante | Avisar abertura | Consentimento | Até a abertura + 90 dias, ou revogação |

**Papéis:** Webag = controladora dos dados de conta e pedido; a loja recebe os dados necessários à entrega como controladora própria para a entrega e a nota (termos do lojista devem prever isso `[validar]`).
**Direitos atendidos (art. 18):** confirmação e acesso, correção (no app), exclusão, portabilidade, informação sobre compartilhamento, revogação do consentimento; atendidos por funções do app (WB-212, 213, 196, 032) e pelo canal WB-217.
**Compartilhamento:** provedor de pagamento (Mercado Pago), push (Expo/FCM/APNs), e-mail (SMTP escolhido), storage, Sentry (sem dado pessoal), loja do pedido. Listados na política.
**Exclusão:** bloqueada com pedido ou troca em aberto (HIP-024); efeito imediato (sessões encerradas, login impossível); anonimização em <= 15 dias; dados fiscais retidos conforme tabela com acesso restrito.
**Incidente:** vazamento com risco relevante: comunicação à ANPD e aos titulares em prazo razoável (a regulamentação da ANPD fixa prazo curto, ~3 dias úteis `[validar]`); procedimento é do `security-engineer`; o PO exige o registro do incidente no painel admin (Could, backlog depois).

## Requisitos não funcionais
- **Minimização:** nenhum campo sem finalidade registrada (não coletamos CPF no cadastro, data de nascimento nem gênero).
- **Segurança:** dados em trânsito (TLS) e em repouso para CPF, documentos e tokens (criptografia); documentos em storage privado com URL assinada de curta duração; senha com Argon2; backups com retenção compatível com a exclusão (a exclusão se propaga aos backups no ciclo normal de rotação `[validar]`).
- **Logs:** sem dado pessoal em claro (e-mail, CPF, telefone mascarados ou hash).
- **Transparência:** política em português claro, versão vigente em URL pública; resumo de 1 tela no cadastro.
- **Acessibilidade:** textos legais com contraste AA e tamanho de fonte ajustável.
- **Lojas:** preencher Data Safety (Google) e App Privacy (Apple) a partir deste inventário (insumo do G5).

## Histórias e critérios de aceite

### WB-210 Termos e privacidade: aceite versionado — Must — dep: WB-117
Como titular, quero saber o que aceito, para decidir com clareza.
- **C1** Dado o cadastro, então vejo os links "Termos de Uso" e "Política de Privacidade" (abrem em tela própria) e um resumo curto "Usamos seus dados para..." antes de marcar o aceite.
- **C2** Dado aceitar, então grava versão dos dois documentos, data/hora, IP e plataforma.
- **C3** Dado nova versão marcada como relevante (WB-117 C2), então no próximo uso o app/painel exige aceitar de novo antes de continuar; recusar leva ao logout e à opção de excluir a conta. A API responde com o código de erro específico `terms_acceptance_required` (403) em **toda rota autenticada**, exceto aceite, logout e exclusão de conta; o cliente do app trata esse código levando à tela de aceite. Vale para todos os usuários do tipo afetado, no próximo uso (R-32a, R-35).
- **C4** Dado lojista, então aceita também os "Termos do Lojista" (incluindo responsabilidade fiscal e papel de controlador da entrega).
- **C5** Dado as páginas públicas `/termos` e `/privacidade` (web), então carregam sem login e mostram a versão vigente.

### WB-211 Consentimentos granulares — Must — dep: WB-210
Como titular, quero dar e retirar consentimentos separadamente, para controlar meus dados.
- **C1** Dado cada finalidade com base em consentimento (marketing push, marketing e-mail, localização precisa, lista de espera), então existe um consentimento próprio, desmarcado por padrão e separado do aceite de termos.
- **C2** Dado conceder, então grava tipo, versão do texto, data/hora, canal.
- **C3** Dado revogar (em Conta, Notificações ou link do e-mail), então vale de imediato e grava a revogação.
- **C4** Dado recusar um consentimento opcional, então o app continua funcionando por inteiro (sem bloqueio indevido).
- **C5** Dado permissão de localização do SO negada, então o app oferece CEP/cidade (WB-001).

### WB-212 Exportar meus dados — Must — dep: WB-032
Como titular, quero baixar uma cópia dos meus dados, para ver o que o Webag guarda.
- **C1** Dado "Exportar meus dados" em Conta, então confirmo com senha e vejo "Enviaremos por e-mail em até 24 h".
- **C2** Dado a preparação, então gera arquivo (JSON legível e CSV) com perfil, endereços, pedidos (itens, valores), trocas, avaliações, favoritos, consentimentos e preferências; **sem** dados de terceiros nem segredos.
- **C3** Dado o e-mail, então traz um link de download que exige login, válido por `exportacao_validade_dias` (7); depois expira.
- **C4** Dado uma nova solicitação enquanto há uma em andamento, então vejo "Você já tem uma em andamento"; limite de 1 por dia.
- **C5** Dado a conta bloqueada ou excluída, então o pedido pelo canal WB-217 é atendido manualmente em até 15 dias.
- **C6** Dado o lojista, então exporta os dados da própria conta (perfil, loja, pedidos, financeiro) pelo painel.

### WB-213 Excluir conta no app — Must — dep: WB-032
Como cliente, quero excluir minha conta dentro do app, para sair do Webag (exigência Apple e LGPD).
- **C1** Dado Conta > "Excluir minha conta", então vejo o que acontece (o que será apagado e o que a lei obriga a guardar), peço **só a senha** (sem código por e-mail, mesmo com e-mail não confirmado; DEC-014/015, SEC-008 c) e uma confirmação "Excluir". Conta criada só com login social (sem senha) confirma com nova autenticação do provedor.
- **C2** Dado pedido ou troca em aberto, então bloqueio com a lista e "Conclua antes de excluir" (HIP-024).
- **C3** Dado confirmar, então a conta é desativada na hora (sessões e tokens de push encerrados, login impossível) e a anonimização de nome, e-mail, celular, endereços, favoritos, histórico de busca e fotos ocorre em até `exclusao_anonimizacao_dias` (15); pedidos/pagamentos ficam sem identificação pessoal direta, exceto o exigido pela obrigação fiscal.
- **C4** Dado e-mail de confirmação, então recebo aviso "Sua conta foi excluída" (sem dados).
- **C5** Dado conta com login social, então o vínculo é revogado (WB-010 C4).
- **C6** Dado o mesmo e-mail depois, então posso criar nova conta sem herdar dados.
- **C7** Dado o fluxo, então não exige contato com o suporte nem espera por aprovação manual.
- **C8** Dado lojista dono, então a exclusão da conta exige antes encerrar a loja (pedidos em aberto concluídos, sem estorno ou disputa pendente e, no modo centralizado, repasse quitado).
- **C9** Dado senha errada, então a exclusão não ocorre e a tentativa conta no limite de WB-221.

### WB-214 Excluir conta pela web — Must — dep: WB-213
Como ex-usuário sem o app, quero pedir exclusão pela web, para atender o Google Play.
- **C1** Dado a URL pública (ex.: `/excluir-conta`), então posso informar o e-mail e confirmar por código enviado a esse e-mail.
- **C2** Dado a confirmação, então segue as mesmas regras de WB-213 (bloqueios, prazos, anonimização).
- **C3** Dado e-mail sem conta, então resposta idêntica ("Se existir, enviamos um código") sem revelar a existência.
- **C4** Dado a URL, então consta no formulário Data Safety e na política de privacidade.
- **C5** Dado excesso de tentativas (5 por hora por IP/e-mail), então bloqueio temporário.
- **C6** Dado conta com **e-mail não confirmado**, então o código enviado ao e-mail não basta (não prova que o solicitante é o dono): a exclusão pela web exige também a **senha** da conta, igual a WB-213 C1 (DEC-020d, SEC-008c; R-30). A pergunta em aberto sobre "senha ou código" está encerrada.
- **C6** Dado conta com e-mail ainda não confirmado, então a exclusão também é possível pela web informando e-mail e **senha** (sem código), com resposta igual exista ou não a conta [confirmar com o security-engineer: SEC-002 prevê código com finalidade delete_web].

### WB-215 Retenção e anonimização — Must — dep: WB-213
Como Webag, quero aplicar retenção e anonimização automaticamente, para não guardar dado além do necessário.
- **C1** Dado o job diário, então processa as exclusões vencidas (15 dias), apaga fotos de troca após 180 dias, documentos de lojas reprovadas após 90 dias e expira exportações após 7 dias.
- **C2** Dado a anonimização, então substitui por valores não reversíveis e mantém a integridade referencial dos pedidos e do ledger (relatórios continuam fechando).
- **C3** Dado cada execução, então registra contagens (sem dados pessoais) e falhas geram alerta (WB-198).
- **C4** Dado as retenções, então são lidas dos parâmetros (RN-02/HIP-035) e documentadas na política.
- **C5** Dado teste automatizado, então um usuário criado, com pedidos, e excluído fica sem identificação pessoal em todas as tabelas, exceto o retido por lei.

### WB-216 Minimização perante o lojista — Must — dep: WB-067
Como cliente, quero que a loja veja só o necessário, para proteger meus dados.
- **C1** Dado pedido ativo, então a loja vê nome, telefone (para contato da entrega) e endereço de entrega; nunca e-mail, CPF ou outros endereços.
- **C2** Dado `dados_cliente_visivel_dias` (30) após a conclusão, então telefone e endereço aparecem mascarados no histórico (ex.: "(11) 9****-1234"; "Rua X, ***").
- **C3** Dado retirada, então a loja vê só o nome e o código.
- **C4** Dado funcionário sem permissão de pedidos, então não vê nenhum dado do cliente.
- **C5** Dado exportação de pedidos pelo lojista, então respeita as mesmas máscaras.

### WB-217 Canal do titular e encarregado — Must — dep: WB-117
Como titular, quero saber a quem pedir, para exercer meus direitos.
- **C1** Dado a política e o app (Ajuda > Privacidade), então mostram o nome do encarregado (inicialmente o fundador `[validar]`) e um e-mail dedicado.
- **C2** Dado solicitação recebida, então o admin registra no painel (tipo, data, prazo de 15 dias, resposta) e recebe alerta aos 10 dias.
- **C3** Dado a lista de solicitações, então só super admin acessa; o histórico guarda o que foi respondido.
- **C4** Dado resposta, então o titular recebe e-mail com o resultado.

### WB-218 Proteção e registro de acesso a documentos — Must — dep: WB-052
Como lojista, quero que meus documentos só sejam vistos por quem precisa, para ficar seguro.
- **C1** Dado documentos enviados, então só admin (super e operação) acessa, por URL assinada com validade <= 5 min.
- **C2** Dado cada visualização ou download, então o admin **escolhe um motivo obrigatório** (lista curta: análise inicial, dúvida, denúncia) e o sistema grava quem, quando, qual documento e motivo (auditoria, WB-123); sem motivo, o arquivo não abre (R-28a).
- **C3** Dado o lojista, então vê a lista e a data dos documentos que enviou, mas **não baixa nem os próprios nem os de outras lojas**; a loja não tem acesso a documentos do cliente (R-28b).
- **C4** Dado reprovada, então os arquivos são apagados em `90` dias (WB-215).
- **C5** Dado tentativa de acesso sem permissão, então 403 e alerta.

## Dependências e riscos
| Item | Tipo | Mitigação |
|---|---|---|
| Parecer jurídico sobre bases legais, papéis (controlador/operador), retenção de pedidos e texto dos termos | Risco legal alto | Encaminhado ao fundador; minuta técnica do PO |
| Threat model (login, pagamento, upload, dados pessoais) | Obrigatório (DoR) | security-engineer antes do G3 das histórias afetadas |
| Prazos da ANPD para incidente | Risco | security-engineer define procedimento |
| Backups retendo dado excluído | Risco técnico/legal | Rotação documentada; `[validar]` |
| Lojista usa dado do cliente fora da plataforma (WhatsApp) | Risco de abuso | Termos do lojista, máscaras após 30 dias, auditoria |
| Apple/Google divergem na exclusão (web obrigatória no Google) | Requisito de loja | WB-214 |

## Perguntas em aberto
| Pergunta | Quem responde |
|---|---|
| Encarregado (DPO) inicial e e-mail dedicado | fundador |
| Bases legais definitivas e textos | fundador/jurídico |
| Prazo exato e canal de comunicação de incidente à ANPD | security-engineer |
| Retenção de consentimentos e backups | security-engineer + tech-lead |
