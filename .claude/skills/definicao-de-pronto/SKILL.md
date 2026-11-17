---
name: definicao-de-pronto
description: Definition of Ready, Definition of Done, critérios dos gates G0–G5 e escala de severidade do Webag. Use ao refinar histórias, planejar sprint, aceitar entregas ou decidir release.
---

# Definition of Ready (história pode entrar na sprint)

- [ ] Escrita no formato "Como <persona>, quero <ação>, para <valor>" e cabe em uma sprint
- [ ] Critérios de aceite em Gherkin, testáveis, incluindo erro, vazio e limites
- [ ] Regras de negócio explícitas (valores, prazos, quem pode o quê)
- [ ] Spec de tela com todos os estados (se tem interface)
- [ ] Contrato de API definido ou marcado como "a definir pelo back-end nesta história"
- [ ] Threat model feito, se toca login, dados pessoais, pagamento, upload ou permissões
- [ ] Dependências externas resolvidas ou com data (credenciais, contas, conteúdo do fundador)
- [ ] Estimada pelos devs

# Definition of Done (história está pronta)

- [ ] Todos os critérios de aceite atendidos e verificados pelo QA
- [ ] Code review do `tech-lead` aprovado; lint, typecheck e testes passando no CI
- [ ] Testes automatizados novos cobrindo regra de negócio e caminho principal
- [ ] Contrato OpenAPI atualizado e cliente `shared` regenerado
- [ ] Estados de carregando, vazio, erro e offline implementados (mobile)
- [ ] Sem achado de segurança Crítico/Alto aberto
- [ ] Eventos de analytics instrumentados (se definidos no PRD)
- [ ] Documentação afetada atualizada (ADR, modelo de dados, README)
- [ ] Aceita pelo PO

# Gates

| Gate | Entra quando | Pareceres necessários |
|---|---|---|
| G0 Visão | Brief preenchido, objetivos e restrições claros | Fundador aprova |
| G1 Descoberta | Pesquisa, personas, hipóteses, escopo do MVP (dentro/fora) | PO; CEO decide |
| G2 Solução | Fluxos e telas do MVP, ADRs principais, OpenAPI inicial, threat model do MVP, plano de entrega | Designer, Devs, Security, PM |
| G3 Sprint pronta | Histórias da sprint passam na DoR | PM |
| G4 Release candidate | DoD em todas as histórias, regressão ok | QA e Security aprovam (veto) |
| G5 Publicação | Checklist de lojas, política de privacidade, Data Safety/App Privacy, contas | QA, Security, PO; fundador autoriza |

# Severidade (bugs e achados)

| Nível | Exemplos | Efeito |
|---|---|---|
| Crítica | Perda de dinheiro, vazamento de dados, pagamento/pedido inconsistente, crash no fluxo principal, tomada de conta | Bloqueia release; corrige já |
| Alta | Fluxo principal quebrado com contorno difícil, autorização falha sem dado sensível, falha em parte das plataformas | Bloqueia release |
| Média | Funcionalidade secundária quebrada, problema de UX relevante | Corrige na próxima sprint |
| Baixa | Cosmético, texto | Backlog |
