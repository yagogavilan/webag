# Skills do grupo 1 (CEO, product-owner, project-manager): fontes e descartes

Data: 2026-11-22. Regras: `docs/equipe/guia-skills-externas.md`. Licenças conferidas no arquivo LICENSE de cada repositório (raw.githubusercontent.com, ramo `main`). As páginas foram lidas via WebFetch, que devolve resumo do conteúdo; nada foi copiado literalmente, e todo texto é reescrito em português e adaptado ao Webag. Nenhum script, hook, `allowed-tools` ou comando de instalação foi trazido.

## Licenças confirmadas
| Repositório | Licença | Titular |
|---|---|---|
| obra/superpowers | MIT | Jesse Vincent (2025) |
| coreyhaines31/marketingskills | MIT | Corey Haines (2025) |
| phuryn/pm-skills | MIT | Pawel Huryn (2026) |
| product-on-purpose/pm-skills | Apache-2.0 | Jonathan Prisant (2026) |
| garrytan/gstack | MIT | Garry Tan (2026), mas DESCARTADO por segurança (ver abaixo) |

Atribuição MIT/Apache-2.0: cada skill traz a seção "Fontes e licença" com repositório, skill de origem, titular, data e adaptação.

## Skills criadas
| Skill | Agente | Origem (URL) | Licença | Consultada em | Adaptação | Descartes e por quê |
|---|---|---|---|---|---|---|
| decisao-estrategica | CEO | github.com/phuryn/pm-skills (pm-execution: `pre-mortem`, `strategy-red-team`) | MIT | 2026-11-22 | Tigre/Tigre de papel/Elefante, "Falha se", classificação reversível x irreversível, ligada ao CLAUDE.md §7 e ao log de DEC | gstack `plan-ceo-review` descartada (ver §Descartes); método de modos de escopo reescrito do zero a partir de conhecimento geral |
| economia-de-marketplace | CEO | github.com/phuryn/pm-skills (`monetization-strategy`, `north-star-metric`) | MIT | 2026-11-22 | Fórmulas únicas (GMV, take rate, contribuição por pedido, CAC/LTV/payback), cold start, densidade, liquidez, tabela de premissas `[HIPÓTESE]` | Parte "SaaS/assinatura" descartada; metas numéricas deixadas como hipótese |
| go-to-market-e-lancamento | CEO | github.com/coreyhaines31/marketingskills (`launch`, `pricing`, `product-marketing`); github.com/phuryn/pm-skills (`beachhead-segment`, `gtm-strategy`) | MIT | 2026-11-22 | Portão de prontidão, fases piloto a abertura, funil do lojista porta a porta, preço de comissão, contexto de marketing versionado em `posicionamento.md` | Product Hunt, e-mail, SEO e demais táticas de SaaS descartados (fora do contexto local); não duplica `estrategia-social`/`copy-que-converte` |
| delegacao-e-verificacao | CEO | github.com/obra/superpowers (`dispatching-parallel-agents`, `subagent-driven-development`, `verification-before-completion`) | MIT | 2026-11-22 | Checagem do briefing do `ceo.md`, paralelismo (máx. 3, DEC-010), estados de retorno, tabela afirmação x evidência, 2 passagens de revisão | Git worktree, arquivo de ledger e instruções de ferramentas específicas descartados |
| comunicacao-com-o-fundador | CEO | github.com/phuryn/pm-skills (`stakeholder-map`) + conhecimento geral | MIT | 2026-11-22 | BLUF, pedido de decisão em lote com recomendação e padrão, como discordar, má notícia, tradução de jargão | Sem fonte pública específica para o núcleo; marcado "inspirado em" |
| descoberta-continua | product-owner | github.com/phuryn/pm-skills (`opportunity-solution-tree`, `identify-assumptions-new`, `interview-script`); inspiração em Teresa Torres e The Mom Test | MIT | 2026-11-22 | Árvore de oportunidades, mapa de premissas HIP-###, roteiro para o fundador aplicar, anti-viés | Brainstorms e dashboards do pacote descartados (sem uso aqui) |
| priorizacao-de-backlog | product-owner | github.com/phuryn/pm-skills (`prioritization-frameworks`) | MIT | 2026-11-22 | Escolha do método, RICE com esforço incluindo tempo do fundador, piso legal fora do ranking, corte de MVP e gatilho de retorno | Eisenhower e matriz ponderada descartados (pouco valor aqui) |
| historias-e-criterios-de-aceite | product-owner | github.com/product-on-purpose/pm-skills (`deliver-acceptance-criteria`, `deliver-edge-cases`); github.com/phuryn/pm-skills (`user-stories`) | Apache-2.0 / MIT | 2026-11-22 | INVEST, Gherkin em português com exemplo do Webag, cenários obrigatórios, divisão vertical, aceite/recusa | Formato "4 a 6 critérios numerados" do phuryn trocado por Gherkin (exigência do `product-owner.md`) |
| metricas-de-produto | product-owner | github.com/phuryn/pm-skills (`north-star-metric`); github.com/product-on-purpose/pm-skills (`measure-instrumentation-spec`) | MIT / Apache-2.0 | 2026-11-22 | North Star candidata `[HIPÓTESE]`, entradas e guardrails, AARRR por lado, eventos mínimos, LGPD | Partes de traços de IA do plano de rastreio descartadas (não se aplicam) |
| pesquisa-de-mercado-e-concorrencia | product-owner | github.com/phuryn/pm-skills (`market-sizing`, `competitor-analysis`) | MIT | 2026-11-22 | TAM/SAM/SOM por dois caminhos com faixas, hierarquia de fontes, 3 camadas de concorrência (inclui WhatsApp da loja), anti-viés | "5 concorrentes por busca web" descartado: no Webag o substituto principal é o WhatsApp |
| planejamento-e-estimativa | project-manager | github.com/phuryn/pm-skills (`sprint-plan`) + conhecimento geral | MIT | 2026-11-22 | Estimativa relativa e PERT, capacidade com fundador e limite de uso, buffers, formato de `sprint-NN.md` | Velocidade em horas de pessoas descartada; reserva 15 a 20% mantida como `[HIPÓTESE]` |
| gestao-de-riscos-e-raid | project-manager | github.com/phuryn/pm-skills (`pre-mortem`) + PMBOK (conhecimento geral) | MIT | 2026-11-22 | Matriz P x I 1 a 9, gatilho, plano B, dono e data dentro do formato do RAID do board | Colunas novas no board descartadas (só o PM edita o board; campos vão na coluna Ação) |
| caminho-critico-e-dependencias | project-manager | github.com/phuryn/pm-skills (`sprint-plan`, etapa de dependências) + CPM (conhecimento geral) | MIT | 2026-11-22 | Tipos de dependência do Webag, tabela ES/EF/LS/LF, itens de longo prazo, regra de bloqueio | Diagramas (Gantt/PERT gráfico) descartados: decorativos |
| relatorio-de-status-executivo | project-manager | github.com/phuryn/pm-skills (`stakeholder-map`) + práticas gerais | MIT | 2026-11-22 | Semáforo com critério, evidência, delta, bloqueios e decisões em lote, checklist de envio | Critérios numéricos próprios marcados `[HIPÓTESE]` |
| retrospectiva-e-melhoria-continua | project-manager | github.com/product-on-purpose/pm-skills (`iterate-retrospective`); github.com/phuryn/pm-skills (`retro`) | Apache-2.0 / MIT | 2026-11-22 | 3 formatos, métricas de fluxo (lead time, cycle time, WIP, throughput), 5 porquês sem culpa, até 3 ações | Retro baseada em métricas de git por pessoa descartada (agentes; não comparar autores) |

## Descartes por segurança ou licença
| Item | Motivo |
|---|---|
| garrytan/gstack (`plan-ceo-review`, `retro` e o README) | Licença MIT é compatível, mas o README e o `SKILL.md` do `plan-ceo-review` trazem instruções dirigidas ao agente (clonar para `~/.claude/skills`, rodar `./setup`, editar o CLAUDE.md, obrigar o uso de ferramenta específica, blocos de preâmbulo/telemetria e arquivos externos que "devem ser carregados"). Pela regra 1 do guia, a fonte foi descartada e **nenhum texto dela foi usado**. A skill `decisao-estrategica` usa pre-mortem e red team do phuryn (MIT) e conhecimento geral |
| deanpeters/Product-Manager-Skills | Não consultado: CC BY-NC-SA, uso comercial vedado (guia §4) |
| alirezarezvani/claude-skills, addyosmani/agent-skills | Não consultados: licença não verificada e sem necessidade, pois as fontes acima cobrem os 15 temas |
| Material do phuryn sobre privacidade/NDA (`pm-toolkit`) | Fora do escopo; o jurídico do Webag segue com o fundador (R-27) |

## Pontos de atenção
- Nenhuma fonte encontrada continha texto malicioso além do gstack acima. As demais foram lidas só como resumo de conteúdo, sem executar nada.
- Skills com conteúdo de método geral (comunicação, caminho crítico, riscos) citam "inspirado em" conhecimento geral; revise se quiser fonte pública explícita.
- Os 15 temas foram mantidos como pedidos; nenhum foi trocado.
- O `CLAUDE.md` descreve o fundador como desenvolvedor web (10+ anos em Customer Success), enquanto o pedido o chama de "não técnico". As skills assumem apenas: pouco tempo, sem trabalho de gestão, jargão traduzido. Ajustar se preferir.
- Para entrarem em uso, o CEO precisa listar as skills no campo `skills:` de cada agente em `.claude/agents/` (não editado aqui, conforme o guia).
