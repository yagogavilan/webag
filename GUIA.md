# Time de Agentes Webag — Guia

## O canal: um Projeto no Claude Code

Você fala com o CEO numa conversa só, pelo app do Claude no celular ou pelo navegador, mandando áudio. O CEO entende, organiza e distribui as tarefas para o time. Cada tarefa roda em paralelo na nuvem, com o especialista certo, e o resultado vai direto para o repositório `yagogavilan/webag`. Você não copia, não cola e não organiza documentos.

```
Você (áudio) → CEO (conversa do Projeto) → tarefas em paralelo (PO, Designer, Devs, Tech Lead, QA, Security, PM)
                                          → tudo salvo no GitHub (docs/ e código), com merge automático
```

## Configuração (uma vez só, ~10 minutos)

1. **Deixe o repositório privado** — ele vai guardar estratégia, análises de segurança e código. GitHub > yagogavilan/webag > Settings > Danger Zone > Change visibility > Private.
2. **Instale o Claude GitHub App** no repositório: github.com/apps/claude > Configure > dê acesso ao `webag`.
3. Em **claude.ai/code** (ou no app do Claude, aba Code), abra **Projects** (pode estar em "More") > **New project** > escolha o repositório `yagogavilan/webag`.
   - Se Projects não aparecer, sua conta ainda não recebeu o recurso (está em beta para Pro e Max). Veja "Plano B" abaixo.
4. Em **Project settings > Memory > Project instructions**, cole o conteúdo de `docs/time/instrucoes-do-projeto.md`. (É a única vez que você copia e cola algo.)
5. Em **Project settings > General**: **Coordinator model** Opus com effort baixo (padrão) e **Thread model** Sonnet com effort alto. O padrão do Projeto é Opus em tudo, o que gasta seu limite bem mais rápido. O CEO pede Opus só para a segurança e decisões difíceis.

Pronto. A partir daí, use só a conversa do Projeto.

## Como usar no dia a dia

- **Mande áudio** pelo microfone do teclado do celular (ou do app, quando aparecer). Pode falar solto, misturar assuntos — o CEO separa as demandas e diz o que entendeu.
- **Primeira mensagem sugerida:** "Vamos começar o Webag. Faz o kickoff." O CEO vai te entrevistar sobre o negócio.
- **Para acompanhar:** "como está o projeto?" — ou abra a aba **Overview** do Projeto, que mostra o que está rodando, o que terminou e o que espera resposta sua.
- **Quando uma tarefa pedir aprovação** (aparece como esperando você no Overview), abra a tarefa e aprove ali. O ok dado na conversa principal não chega nela.
- **Arquivos do MVP antigo:** mande no chat e peça para o CEO colocar no repositório.

## O que só você faz

Criar e pagar contas (Apple Developer, Google Play, Mercado Pago, domínio, servidor), conversar com lojistas (o PO prepara o roteiro), testar no celular (o QA manda um roteiro curto), validar termos e política de privacidade com um profissional, e autorizar gastos e publicação. O CEO pede cada coisa no momento certo.

## Economia de uso

- Projetos gastam o limite do plano mais rápido que uma conversa comum, porque várias tarefas rodam ao mesmo tempo. As regras de economia estão no `CLAUDE.md` e nas instruções do CEO.
- Se quiser segurar o ritmo, diga: "no máximo 2 tarefas ao mesmo tempo".
- Uma tarefa que bate no limite do plano espera e continua sozinha quando o limite renova.

## Plano B — sem Projects

Use uma sessão comum da aba Code com o repositório `webag`. Nela os agentes de `.claude/agents/` e os comandos (`/kickoff`, `/nova-feature`, `/sprint`, `/release`, `/status`) carregam automaticamente, e o CEO já abre como agente principal. Funciona pelo celular e com áudio do mesmo jeito; a diferença é que fica tudo numa sessão só, em vez de tarefas paralelas com o painel Overview.

## O que tem no repositório

```
CLAUDE.md                        regras do time (toda tarefa lê)
docs/time/instrucoes-do-projeto  instruções do CEO para o Projeto
.claude/agents/                  os 9 papéis (CEO, PO, PM, Designer, Back-end, Mobile, Tech Lead, QA, Security)
.claude/skills/                  padrões técnicos e fluxos (kickoff, nova-feature, sprint, release, status)
.claude/settings.json            CEO como agente principal + proteções (usado no Plano B)
docs/                            memória do time: visão, decisões, ADRs, board
```

Para mudar o comportamento de alguém, basta pedir ao CEO ("o QA está sendo muito detalhista, ajusta") — ele manda uma tarefa editar o arquivo do papel.
