# Roteiros de teste de usabilidade — Webag 1.0

Dono: qa-engineer (com product-designer) | Data: 2026-11-18 | Executa na Onda 8.4 (`plano-execucao.md`); relatório em `docs/qa/usabilidade.md` (modelo na §6).
Metas e fluxos: `docs/design/fluxos.md` §2 a §6 (orçamento de toques/tempo). Brief §5 e §7: morador compra em menos de 2 minutos sem ajuda; teste com tarefas reais contando toques, telas e palavras.

## 1. Limites e honestidade do método
| Ponto | Consequência |
|---|---|
| Não há usuários reais nem aparelho no ambiente do time | O que o time executa é **percurso cognitivo cronometrado** por QA e Designer (simula o novato), não teste com público. Todo resultado dessa rodada é `[HIPÓTESE]` |
| O que o percurso mede bem | Contagem de toques, telas, campos e palavras; passos sem retorno visual; textos ambíguos; inconsistência entre telas; estados faltando |
| O que o percurso **não** mede | Hesitação real, vocabulário do morador de Francisco Morato, leitura em sol forte, medo de app novo, confiança no PIX |
| Recomendação | Quando o fundador puder, repetir os 4 roteiros com 5 pessoas do perfil (3 clientes, 1 lojista de loja pequena, o próprio fundador como admin). Cinco participantes costumam revelar a maior parte dos problemas graves de um fluxo `[HIPÓTESE, regra prática de Nielsen]`; o roteiro abaixo serve igual, trocando o executor |
| Tempo dos bancos e do MP | O pagamento no app do banco e o OAuth real do Mercado Pago ficam fora; no teste, o provedor `fake` aprova (cronometrar só "no Webag" e somar 25 s de banco `[HIPÓTESE do Designer]`) |

## 2. Definições de medida (iguais em todos os roteiros)
| Medida | Como contar |
|---|---|
| Toque/clique | Cada toque ou clique em botão, link, caixa, item de lista, aba ou ícone. Rolar, arrastar para rolar e digitar não contam. Toque que erra o alvo conta; "Voltar" conta |
| Campo | Cada campo de texto/seleção preenchido. Preenchimento automático do sistema conta como campo, tempo ≈ 0 |
| Tela | Cada mudança de tela inteira ou de rota; folha inferior (bottom sheet) e diálogo contam como meia tela, registrar à parte |
| Palavras na tela de decisão | Tela onde o usuário escolhe a ação principal do passo. Contar palavras de **interface** (título, rótulo, botão, mensagem, ajuda). Não contar conteúdo (nome de loja ou produto, preço, número, endereço) nem barra do sistema. Capturar a tela e contar no arquivo |
| Tempo | Do primeiro toque ao evento final definido no roteiro. Cronômetro de vídeo/gravação de tela, em segundos. Pausa só para o facilitador ler a instrução |
| Erro | Toque ou entrada que leva a mensagem de erro, tela errada ou desfazer. Registrar o tipo |
| Ajuda | Qualquer intervenção do facilitador. Uma ajuda = tarefa **não concluída sem ajuda** |
| Dificuldade percebida | Pergunta única (SEQ) ao fim de cada tarefa: "De 1 (muito difícil) a 7 (muito fácil), como foi?" |

Sucesso = chegou ao evento final **sem ajuda** dentro de 2x o tempo meta. Meta cumprida = dentro do tempo e do orçamento de toques/campos/palavras.

## 3. Preparação (vale para todos)
| Item | Detalhe |
|---|---|
| Build | Release candidate (ou build de staging) com `PAYMENT_PROVIDER=fake`, seed completo (`docker compose up`), `main` na tag do RC |
| Aparelho | Emulador Android de entrada (2 GB, tela 5,5", perfil 4G limitado a 3 Mbps / 150 ms) e, se houver, aparelho real do fundador. Painel web: Chrome no celular (360 px) e desktop 1366x768 |
| Contas | Cliente novo (sem conta), cliente recorrente (endereço e PIX anteriores), lojista novo (e-mail de teste no Mailpit), admin operação com TOTP configurado |
| Registro | Gravação de tela do emulador com relógio visível; planilha por participante (§5); capturas das telas de decisão |
| Instrução ao executor | Ler o cenário na primeira pessoa, sem usar termos da interface ("sacola", "PIX copia e cola"). Pensar em voz alta. Não ajudar; se travar por 60 s, registrar "travou" e dar a dica mínima (conta como ajuda) |
| Ordem | R1 novo, R1 recorrente, R2, R3, R4. Cada participante faz no máximo 3 roteiros (fadiga) |

## 4. Roteiros

### R1. Comprar (cliente novo e recorrente) — WB-001 a 025, 035 | fluxos §2 e §3
**Persona:** morador de Francisco Morato, Android de entrada, 4G instável, desconfiado. **Cenário (ler ao executor):** "Você precisa de uma camiseta para amanhã. Abra o aplicativo e compre uma camiseta de uma loja perto da sua casa, pagando com PIX. Avise quando achar que o pedido está pago."
**Pré-condições:** app recém-instalado (novo) ou conta e endereço salvos (recorrente); loja aberta com camiseta em 3 tamanhos e 3 cores; sem cupom.
**Evento final:** tela "Pedido confirmado" depois do `fake` aprovar o PIX (o facilitador aprova no endpoint de dev ao ouvir "paguei").

| # | Passo esperado (novo) | Toques | Campos | Tela de decisão: o que observar |
|---|---|---|---|---|
| 1 | Abrir, "Usar minha localização", permissão | 2 | 0 | O morador entende por que o app pede localização? Recusa leva ao CEP sem beco |
| 2 | Início, tocar numa loja | 1 | 0 | A loja certa se destaca? Aberta/fechada legível sem ler parágrafo |
| 3 | Tocar no produto | 1 | 0 | Foto, preço e promoção claros? |
| 4 | Tamanho, cor, "Adicionar" | 3 | 0 | Esgotado visível? Erro "Escolha o tamanho" é entendido? |
| 5 | "Ver sacola", conferir, "Ir para o pagamento" | 2 | 0 | Total sem surpresa (frete e taxas já visíveis)? |
| 6 | Criar conta: nome, e-mail, celular, senha, confirmar senha, aceite, "Criar conta" | 2 | 5 | Medidor de senha; máscara do celular; erro de "gmial.com"; tempo do campo "Confirmar senha" |
| 7 | Checkout em 1 tela: confirmar o número do endereço, "Pagar com PIX" | 1 | 1 | Entrega x retirada compreensível? PIX já selecionado? |
| 8 | PIX: "Copiar código" | 1 | 0 | Contagem regressiva, QR e botão copiar visíveis sem rolar? |
| | **Meta (fluxos §2)** | **≤ 13** | **≤ 6** | **7 telas, ≤ 25 palavras por tela de decisão, ≤ 93 s no app, ≈ 118 s com o banco** |

**Recorrente (logado, endereço salvo):** meta 6 telas, ≤ 10 toques, 0 campos, ≤ 45 s no app.
**Armadilhas a observar (cada uma vira achado se acontecer):** (a) tocar em "Adicionar" sem escolher o tamanho; (b) olhar para "Faltam R$ X" quando abaixo do mínimo e não achar o caminho; (c) sair do app no passo do PIX e voltar; (d) rede cai (modo avião por 10 s) na tela do PIX; (e) código do e-mail chega e o executor não sabe se é obrigatório (HIP-D07: não bloqueia a compra); (f) trocar de loja com item na sacola.
**Perguntas ao fim:** "Quanto você pagou no total? Para onde vai o pedido? O que acontece se o PIX vencer?" (mede compreensão, deve acertar as 3); SEQ.
**Critério de aprovação:** tempo e orçamento dentro da meta em 80% das execuções e nenhum bloqueio (ajuda) nos passos 4 a 8. Estouro de tempo por CPF exigido pelo MP (WB-023 C7) é desvio conhecido (fluxos §2, alavanca 3).

### R2. Cadastrar loja (lojista) — WB-050 a 054 | fluxos §4
**Persona:** dono de loja de roupas, MEI, 45 anos, pouca familiaridade com sistemas, celular Android. **Cenário:** "Você quer vender as roupas da sua loja pelo Webag. Crie sua conta de vendedor e mande sua loja para análise. Tenha em mãos o celular com a foto do seu documento e do comprovante de endereço da loja."
**Pré-condições:** e-mail novo no Mailpit; arquivos de teste: foto de documento (frente e verso), comprovante, cartão CNPJ; provedor `fake` na conexão de recebimento.
**Evento final:** tela "Em análise: respondemos em até 2 dias úteis".

| # | Passo esperado | Toques (est.) | Campos | Observar |
|---|---|---|---|---|
| 1 | Conta: nome, e-mail, celular, senha, confirmar, aceite, criar | 2 | 5 | Texto "Termos do Lojista" compreensível; quem já é cliente é levado a "Entrar" |
| 2 | Código de 6 dígitos (do Mailpit) | 1 | 1 | Teclado numérico; colar; reenviar após 60 s |
| 3 | Etapa 1: CPF ou CNPJ | 2 | 1 | Máscara; erro "Confira o CNPJ"; MEI entendido como CNPJ? |
| 4 | Etapa 2: nome, categoria, WhatsApp, endereço por CEP | 3 | 4 | Autocompletar do CEP; cidade fora da região |
| 5 | Etapa 3: documentos (tirar foto ou escolher) | 4 a 6 | 0 | Pré-visualização; mensagem de arquivo grande; "Tirar foto" abre câmera; permissão negada |
| 6 | Etapa 4: "Conectar Mercado Pago" (`fake`) | 2 | 0 | O lojista entende o que está autorizando? Cancelar e "Conectar depois" |
| 7 | Revisão e "Enviar para análise" | 2 | 0 | Resumo por passo, editar um passo e voltar sem perder |
| | **Meta (fluxos §2)** | **≤ 20** | **≤ 13 (+ 3 ou 4 documentos)** | **≤ 40 palavras por passo; ≤ 10 min** |

**Armadilhas:** (a) sair no meio e voltar pelo e-mail (rascunho preservado? barra "Etapa 3 de 4"); (b) PDF de 8 MB; (c) foto escura; (d) abrir o painel no celular em 360 px com teclado aberto escondendo o botão Continuar; (e) perda de rede no envio de documento; (f) CNPJ alfanumérico (R-18).
**Perguntas ao fim:** "O que acontece agora? Quando você vai saber o resultado? O que você precisa fazer enquanto espera?" (esperado: aguardar até 2 dias úteis; pode cadastrar produtos); SEQ.
**Critério:** concluir sem ajuda em ≤ 10 min; nenhum passo com mais de 40 palavras na tela de decisão.

### R3. Aprovar loja (admin) — WB-103, 104, 218 | fluxos §5
**Persona:** fundador operando sozinho, desktop 1366x768, 20 lojas na fila no pico. **Cenário:** "Há lojas novas esperando. Revise a mais antiga e decida: aprove se estiver tudo certo, ou peça correção dizendo o que está errado."
**Pré-condições:** 3 lojas em análise (A: tudo certo; B: documento ilegível; C: CNPJ divergente do documento); admin operação com TOTP.
**Evento final:** loja A aprovada (e-mail no Mailpit); B com pedido de correção e motivo por item; C recusada com motivo.

| # | Passo esperado (loja A) | Toques | Observar |
|---|---|---|---|
| 1 | Menu Lojas, "Fila de aprovação" | 2 | Selo de prazo visível; ordem pela mais antiga |
| 2 | Abrir o caso | 1 | Documento ao lado dos dados (sem trocar de aba) |
| 3 | Checklist de 6 itens: marcar "Conferido" em cada | 6 | Fadiga; o usuário confere de verdade ou marca por inércia? Existe "marcar todos"? |
| 4 | "Aprovar loja" e "Confirmar" | 2 | Texto do diálogo; aviso de que só aparece com produto e conta |
| | **Meta (fluxos §2)** | **≤ 10** | **≤ 90 s por loja** |

**Previsão do QA para fechar na revisão de papel:** 2 + 1 + 6 + 2 = **11 toques, acima da meta de 10**, se a checklist exigir um toque por item e a fila não abrir já no menu de Lojas. O Designer deve confirmar o caminho real na tela (`design/telas/onda-2-lojista-admin.md`, tela de revisão) antes do teste; se a previsão se confirmar, escolher entre "Conferir tudo" em 1 toque, abrir a fila como página inicial do perfil operação, ou revisar a meta. [HIPÓTESE, contagem de documento, não de uso]
**Armadilhas:** (a) loja B: marcar "Problema" exige "O que está errado?" e liga o item ao campo; o executor acha o campo certo? (b) dois admins na mesma loja ("Já foi decidida por ..."); (c) zoom e giro do documento por teclado e por toque; (d) tentar abrir documento com a sessão sem TOTP vigente; (e) revelar dado pessoal pede motivo; (f) 5 minutos depois a URL do documento expira: o viewer avisa?
**Perguntas ao fim:** "Como você sabe que o lojista foi avisado? O que aconteceu com o documento que você abriu?" (esperado: e-mail enviado; acesso ficou registrado); SEQ.
**Critério:** ≤ 90 s por loja legível, 3 decisões corretas sem ajuda, motivo por item claro para o lojista (conferir no e-mail do Mailpit).

### R4. Pedir troca (cliente) — WB-170, 171, 178, 059 | fluxos §6
**Persona:** a mesma da compra; recebeu a camiseta e o tamanho não serviu. **Cenário:** "A camiseta que você comprou ficou pequena. Peça para trocar por um tamanho maior. Depois acompanhe o pedido de troca."
**Pré-condições:** pedido ENTREGUE há 2 dias, loja que aceita troca por tamanho (prazo 7 dias, taxa R$ 10,00), tamanho G em estoque. Variante: pedido de loja que **não** aceita troca por tamanho (deve ainda aparecer Arrependimento e Defeito).
**Evento final:** tela "Pedido de troca enviado: a loja responde em até 2 dias" e a troca na lista "Em análise".

| # | Passo esperado | Toques | Campos | Observar |
|---|---|---|---|---|
| 1 | Pedidos, abrir o pedido entregue, "Pedir troca" (mostra prazo) | 3 | 0 | O botão aparece no lugar certo, com "Até [data]" |
| 2 | 1 de 4: item (já marcado se for um) | 1 | 0 | |
| 3 | 2 de 4: motivo "Tamanho errado" | 1 | 0 | Só aparecem motivos válidos; explicação quando a loja não aceita |
| 4 | 3 de 4: fotos (opcional) e "Trocar por": tamanho G | 2 | 0 | Variações com estoque; câmera negada |
| 5 | 4 de 4: como devolver (levar à loja ou coleta) | 1 | 0 | Taxa de coleta explicada antes de enviar (cobrança só depois de a loja aprovar: HIP-D09) |
| 6 | Revisão e "Enviar" | 2 | 0 | Resumo completo |
| | **Meta (fluxos §2)** | **≤ 11** | **0 a 1** | **5 telas, ≤ 25 palavras, ≤ 90 s** |

**Armadilhas:** (a) executor escolhe "Defeito" e fica sem como seguir sem foto: a mensagem diz o que fazer? (b) "Arrependimento" é entendido como "desisti" e não como "troca"? o texto deixa claro que termina em reembolso; (c) foto grande/rede lenta (progresso por foto, retentar sem perder as outras); (d) o executor tenta trocar um item já trocado; (e) tenta pedir troca de um pedido fora do prazo (mensagem + WhatsApp).
**Perguntas ao fim:** "O que a loja vai fazer agora? Quanto tempo ela tem? Você vai pagar algo? Quando?" (esperado: responde em 48 h; taxa só após a aprovação); SEQ.
**Critério:** concluir sem ajuda em ≤ 90 s e ≤ 11 toques; as 4 perguntas respondidas corretamente.

## 5. Folha de observação (uma por participante e roteiro)
| Campo | Valor |
|---|---|
| Roteiro / executor (perfil, não nome) / data / build / aparelho e rede | |
| Início, fim, tempo no Webag (s) | |
| Toques (total e por passo) / campos / telas / meias-telas | |
| Palavras na tela de decisão de cada passo (capturas anexas) | |
| Erros (tipo e passo) / ajudas (passo e dica dada) | |
| Concluiu sem ajuda? (S/N) / SEQ (1-7) | |
| Frases do executor em voz alta (literais) | |
| Respostas às perguntas finais (certa/errada) | |

## 6. Modelo do relatório `docs/qa/usabilidade.md`
```
# Relatório de usabilidade Webag <versão> | Data | Build | Executores (perfil) | Método: percurso cognitivo | real
Marcação: resultados do percurso simulado são [HIPÓTESE]; só teste com usuários valida.

1. Resumo (5 linhas): metas atingidas X de 5; bloqueios; recomendação (liberar, ajustar, refazer)
2. Resultado por tarefa
| Tarefa | Telas (meta/obtido) | Toques | Campos | Palavras (maior tela de decisão) | Tempo | Sucesso sem ajuda | SEQ médio | Meta? |
3. Achados
| ID US-### | Tarefa/passo | O que aconteceu (fato, com captura) | Severidade | Heurística ou regra violada | Recomendação | Dono | Bug (BUG-###) |
4. Compreensão (perguntas finais): acertos por pergunta
5. Desvios aceitos (meta estourada com justificativa) e risco
6. O que não foi testado (público real, aparelho real, rede real, sol, acessibilidade assistiva)
7. Decisão: parecer do QA para G4 (informativo) e itens para o Designer/PO
```
Severidade dos achados: **Alta** = o usuário não conclui ou desiste; **Média** = conclui com erro, hesitação > 10 s ou ajuda; **Baixa** = cosmético ou texto. Achado de severidade Alta em fluxo de compra, cadastro de loja ou troca bloqueia G4 (como bug Alto) e vira BUG-### em `docs/qa/bugs.md`.

## 7. Critérios de aprovação para G4 (usabilidade)
1. Comprar (novo): tempo no app ≤ 93 s, ≤ 13 toques, ≤ 6 campos, ≤ 25 palavras na tela de decisão, em pelo menos 4 de 5 execuções, ou desvio aceito pelo PO e pelo Designer com justificativa.
2. Nenhum achado Alto aberto nos 4 fluxos.
3. As perguntas de compreensão da R1 (total, destino, PIX vencido) com 100% de acerto.
4. Cadastro de loja concluído sem ajuda em ≤ 10 min; aprovação de loja ≤ 90 s e ≤ 10 toques (ou meta revisada pelo Designer, ver previsão da R3); troca ≤ 90 s e ≤ 11 toques.
5. Relatório publicado com a marcação `[HIPÓTESE]` enquanto não houver teste com público; a recomendação de repetir com 5 pessoas fica registrada para o fundador.
