---
name: tdd-e-debug-sistematico
description: Ciclo TDD (vermelho, verde, refatorar) e depuração sistemática por causa raiz para o back-end Webag, com Vitest 4 e Testcontainers. Use ao implementar regra de negócio (pedido, estoque, pagamento, comissão, troca), ao corrigir bug ou quando um teste falhar sem explicação.
---

# Lei do TDD
**Nenhum código de produção sem um teste que falhou antes.** Obrigatório em pedido, estoque, pagamento, comissão, estorno e troca (ADR-006). Exceções (protótipo descartável, código gerado como o cliente Orval, config) são justificadas no PR e aprovadas pelo `tech-lead`: o dev não concede exceção a si mesmo.

# Ciclo
1. **Vermelho:** um teste mínimo, nome descreve o comportamento ("recusa pedido abaixo do mínimo"), usando código real (mock só para porta externa: Mercado Pago, e-mail, relógio).
2. **Confirme o vermelho:** rode e veja falhar **pelo motivo certo** (falta o comportamento, não erro de digitação/setup). Teste que passa de primeira testa o que já existe.
3. **Verde:** o código mais simples que passa; nada além.
4. **Confirme o verde:** o teste passa e a suíte inteira continua passando (relate falhas que não são suas, pelo nome).
5. **Refatorar** só no verde: duplicação, nomes, extração. Repita para o próximo comportamento.
Código escrito antes do teste: reescreva a partir do teste; não use o código antigo como "referência" nem apague trabalho alheio sem confirmar com o tech-lead.

# Onde cada tipo de teste mora
| Alvo | Tipo | Dica |
|---|---|---|
| Regra pura (`domain/`) | Unitário, sem Nest e sem banco | Tabela de casos: limites, zero, negativo, centavos |
| Service com banco | Integração com Testcontainers (PostGIS real) | Um banco por suíte; dados criados por fábrica no teste |
| Endpoint | E2E supertest | Sucesso, validação, outro usuário, idempotência repetida |
| Concorrência | `Promise.all` de N chamadas iguais | Estoque 1 com 2 compradores: só 1 vence |
Regras de pedido/estoque/pagamento: teste também o caminho de erro e a transição **inválida** da máquina de estados.

# Anti-padrões de teste
- Afirmar sobre o mock em vez do comportamento. Método existente só para teste dentro de classe de produção. Mockar sem entender o efeito colateral da dependência. Mock incompleto que esconde campo que o código real usa.
- Teste que depende de ordem, de relógio real ou de `sleep`. Espera por condição: use polling com limite (`vi.waitFor`/`expect.poll`), nunca tempo fixo.
- Mocks demais: se o setup é maior que o teste, o desenho está ruim.

# Bug: o teste vem primeiro
Todo bug corrigido começa com um teste que reproduz o defeito (vermelho), depois a correção. O teste fica como guarda de regressão e é citado no PR/`BUG-###`.

# Depuração sistemática (sem causa raiz, sem correção)
**Fase 1, investigar:** leia a mensagem e o stack inteiros; reproduza de forma consistente (se não reproduz, colete mais dados em vez de chutar); veja o que mudou (commits, dependências, config, ambiente). Em fluxo com várias partes (webhook -> `webhook_events` -> job -> serviço -> banco), registre o que entra e sai **em cada fronteira** para achar onde quebra. Rastreie o dado ruim **de trás para frente** até a origem (onde o valor errado nasceu), não onde estourou.
**Fase 2, padrão:** ache código parecido que funciona; liste cada diferença; entenda suposições e dependências.
**Fase 3, hipótese:** uma frase "acho que é X porque Y"; teste com a **menor** mudança, uma variável por vez. Falhou? Nova hipótese, sem empilhar correções.
**Fase 4, correção:** teste que falha primeiro; uma correção na causa raiz, sem refatoração de carona; rode a suíte.

# Regra das 3 tentativas
Duas correções falharam: volte à Fase 1 com o que aprendeu. **Três falharam: pare.** É sinal de problema de desenho, não de hipótese. Registre o que foi tentado e acione o `tech-lead` (via CEO) antes da quarta tentativa.

# Defesa em profundidade
Achada a causa, bloqueie a classe de erro em várias camadas: validação na borda (Zod), regra no service, restrição no banco (`unique`, `CHECK`, FK), log/alerta. Um valor inválido deve ser impossível, não só improvável.

# Sinais de alerta (volte à Fase 1)
"Conserto rápido e investigo depois"; mudar várias coisas de uma vez; pular o teste; "deve ser X" sem prova; aplicar padrão sem entender; quarta tentativa.

# Registro de depuração (no PR ou `BUG-###`)
`sintoma | como reproduzir | causa raiz | evidência | correção | teste de regressão | outras camadas protegidas`.

# Antes de dizer "pronto"
Rode lint, typecheck e a suíte completa e **cole o resultado**; afirmar sem evidência não vale.

## Fontes e licença
- obra/superpowers, skills `test-driven-development` e `systematic-debugging` (inclui técnicas root-cause-tracing, defense-in-depth, condition-based-waiting) (MIT, LICENSE conferido: Copyright 2025 Jesse Vincent), consultadas em 2026-11-22. Foram lidos os SKILL.md; os arquivos de técnicas só por menção. Adaptado: ciclo, anti-padrões, 4 fases e regra das 3 tentativas para Vitest/Testcontainers/ADR-006; exceções aprovadas pelo tech-lead (no original, "parceiro humano"). Omitida a estatística sem fonte do original.
