---
name: modelagem-de-ameacas-stride-e-lgpd
description: Método de threat model do Webag com STRIDE por elemento, casos de abuso de marketplace, pontuação proporcional ao MVP e tabela LGPD (dado, finalidade, base legal, retenção, compartilhamento). Use ao fazer o threat model de uma funcionalidade nova que toque login, dado pessoal, pagamento, upload ou permissão, ou ao preencher inventário LGPD e Data Safety.
---

# Modelagem de ameaças (STRIDE) e LGPD

Complementa `checklist-seguranca` (lista de controles). Aqui: **como derivar as ameaças** e registrar a privacidade. Saída em `docs/seguranca/threat-models/<slug>.md`; exemplo completo: `docs/seguranca/threat-model-auth-pagamento.md`.

## 1. Passos
1. **Escopo e ativos:** dinheiro, dados pessoais, conta, reputação da loja, disponibilidade, trilha de auditoria.
2. **Diagrama de fluxo** (Mermaid) com fronteiras de confiança: app/web <-> API <-> MP/SMS/e-mail <-> banco/fila/storage; admin separado.
3. **STRIDE por elemento** (seção 2). 4. **Abusos de negócio** (seção 3). 5. **Pontuar e decidir** (seção 4). 6. **Controles com teste:** cada controle liga a um caso verificável para o `qa-engineer` (ID do caso ou requisito `SEC-###`). 7. **Risco residual** assinado: aceito só pelo fundador, em `docs/decisoes.md`.

## 2. STRIDE: o que perguntar em cada tipo de elemento
| Elemento | Perguntas |
|---|---|
| Ator externo (cliente, lojista, admin, MP) | **S**poofing: como prova quem é? **R**epudiation: dá para negar ter feito (aceite de termos, estorno, troca)? |
| Processo (rota, job, webhook, gateway) | **S** falsificar origem (webhook sem assinatura); **T**ampering do corpo/valor; **R** sem log de quem fez; **I**nformation disclosure em erro/resposta; **D**oS (sem limite/paginação); **E**levation (papel, IDOR) |
| Armazenamento (tabelas, Redis, bucket) | **T** alteração fora da regra; **R** auditoria; **I** vazamento (backup, log, URL pública); **D** crescimento sem retenção |
| Fluxo de dados (TLS, fila, evento) | **T** adulteração em trânsito/replay; **I** interceptação; **D** perda/duplicação (idempotência) |
Para cada "sim, é possível": ameaça, controle existente, lacuna.

## 3. Abuso de marketplace (atores com motivo)
Cliente fraudador (cupom repetido, contestação falsa, troca indevida), lojista mal-intencionado (recebe e não entrega, preço mudado após pedido, avaliação falsa, fala com cliente fora do app), concorrente (pedidos falsos, scraping, denúncia em massa), bot (cadastro e OTP em massa, enumeração de telefone), insider/admin (consulta indevida, estorno sem trilha), entregador/motoboy (se houver: dado de endereço além do necessário). Para cada abuso: **sinal de detecção + controle mínimo** (limite, trilha, revisão manual, retenção de repasse).

## 4. Pontuação proporcional (MVP)
Probabilidade (1 a 3) x impacto (1 a 3), com impacto 3 = dinheiro, conta ou dado pessoal em escala. 6 a 9: bloqueia G4; 3 a 4: corrige na onda; 1 a 2: backlog com dono. Diga o que **fica para depois** (ex.: pentest, detecção avançada) e por quê. Não exija controle de banco para loja piloto, nem abra mão do básico (auth, autorização por recurso, webhook validado, segredos, LGPD mínima).

## 5. Tabela LGPD (uma linha por dado pessoal)
| Dado | Titular | Finalidade | Base legal (LGPD art. 7) | Quem recebe | Retenção | Direito/ação |
|---|---|---|---|---|---|---|
Exemplo de preenchimento: endereço de entrega | cliente | entregar o pedido | execução de contrato (art. 7, V) | lojista e entregador, só durante o pedido | prazo definido (DT-021, ADR-012) | acesso, correção, exclusão.
Regras: **minimizar** (CPF só se o meio de pagamento exigir; localização precisa só em uso); mais de uma finalidade = mais de uma linha; **legítimo interesse** (IX) para antifraude exige teste de balanceamento escrito; **consentimento** (I) só para o que é opcional (push de marketing), revogável; dado de criança/adolescente e dado sensível: evitar coletar. Operadores e compartilhamento (MP, e-mail, push, hospedagem) listados. Incidente: quem avisa, em quanto tempo e a quem (ANPD e titulares) `[validar o prazo vigente com profissional]`. Os mesmos dados alimentam o Data Safety (Google) e o App Privacy (Apple).
Você não é advogado: aponte o requisito e encaminhe ao fundador/profissional a base legal e os textos.

## Fontes e licença
- STRIDE (Kohnfelder e Garg, Microsoft, 1999) e abordagem por elemento de fluxo; OWASP Threat Modeling Cookbook. Conhecimento geral, texto próprio.
- Lei nº 13.709/2018 (LGPD), arts. 7, 18, 37, 38, 41 e 48; lida de memória do texto legal, **não reconferida nesta sessão**: validar a numeração e o prazo de incidente com profissional.
- Criação própria para o Webag; sem conteúdo de terceiros sob CC BY-SA. Base: `checklist-seguranca` e `docs/seguranca/threat-model-auth-pagamento.md`.
