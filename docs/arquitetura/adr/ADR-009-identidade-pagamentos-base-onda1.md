# ADR-009: Escolhas de implementação da Onda 1 (identidade, configuração e pagamento base)

- **Status:** Aceita (pendente revisão do tech-lead e do security-engineer)
- **Data:** 2026-11-18
- **Autor:** backend-dev
- **Revisores:** tech-lead, security-engineer

## Contexto
A Onda 1 implementa ADR-003 (autenticação), ADR-002/WB-150 (PaymentProvider) e o admin de configuração. Algumas decisões de implementação divergem ou detalham os ADRs; nenhuma tem custo de infraestrutura (tudo roda no Postgres e Redis já previstos).

## Decisões
| # | Decisão | Motivo | Alternativa descartada |
|---|---|---|---|
| 1 | **Refresh seguinte derivado do anterior** por HMAC (`HMAC(AUTH_HMAC_KEY, "refresh-next:" + hash)`) | SEC-011 pede devolver o MESMO par se o cliente repetir o refresh em 30 s; só guardamos hash, então não dá para "devolver o guardado". Derivar torna o retry idempotente sem guardar o token em claro | Guardar o token cifrado por 30 s (mais um segredo e uma tabela) |
| 2 | **Fila de webhook no Postgres** (`webhook_events` + `FOR UPDATE SKIP LOCKED` + backoff exponencial + dead-letter `failed`), sem BullMQ na Onda 1 | Idempotência e fila ficam na mesma transação do banco; zero dependência nova; o mesmo código serve de worker quando houver `APP_ROLE=worker`. SEC-032 exige 2xx rápido e processamento fora do request: atendido | BullMQ agora (dependência e Redis como ponto de falha do dinheiro). Reavaliar na Onda 4A (DT-015) |
| 3 | **Rate limit próprio** em Redis (janela fixa, 40 linhas), falha fechada nos endpoints de auth | DT-003: o storage de throttler declara peer até Nest 11 | `@nestjs/throttler` + storage de terceiros |
| 4 | **Estado da sessão lido do banco a cada request** (sem cache Redis) | Revogação imediata (SEC-010, SEC-014) sem risco de cache velho; custo é 2 consultas indexadas por request, aceitável no MVP | Cache Redis com invalidação (DT-017) |
| 5 | **Provedor `fake` guarda o "lado do provedor" no Redis** | `getPayment` é uma re-consulta real (SEC-034), igual ao Mercado Pago; sobrevive a restart; sem tabela extra | Mapa em memória |
| 6 | **Assinatura do webhook no formato do MP** (`x-signature: ts,v1`, manifesto com `data.id` da QUERY), também no `fake` | O caminho de validação em teste é o do produto real | Assinatura própria só do fake |
| 7 | **Validação de entrada com Zod local no API** (`z.strictObject`), contrato em `openapi.yaml` conferido por teste de deriva de rotas e de segurança | Entrega mais rápida na Onda 1; o OpenAPI continua a fonte para o cliente gerado | Validar com os schemas Zod gerados (ADR-007 §Pipeline): vira DT-014 |
| 8 | **Chave de cifra do TOTP e HMAC dos códigos derivadas de `AUTH_HMAC_KEY`** (HKDF por contexto) | Um segredo a gerir na Onda 1. O Security pediu `MFA_ENC_KEY` separada (SEC-090) | Segredos separados: troca simples, registrada como pendência (DT-018) |
| 9 | **Admin: login em uma chamada** (`password` + `totpCode`), sem `mfa_token` intermediário | Mesmo efeito de segurança (nenhum token antes do 2º fator) com menos estado; a UI de 2 passos pode guardar a senha em memória até o código | `mfa_token` de SEC-090 (DT-018) |
| 10 | **UUID v4 (`gen_random_uuid()`)** nos IDs | Funciona no PG 16 e 18; SEC-025 aceita v4 ou v7 | `uuidv7()` do PG 18 (DT-016) |

## Consequências
- Positivas: nada de infra nova; fluxos de dinheiro e sessão com teste de integração em banco e Redis reais.
- Negativas / dívida: DT-014 a DT-018 em `divida-tecnica.md`.
- Reavaliar se: houver mais de uma instância da API (mover a fila para worker/BullMQ), ou o Security reprovar as decisões 8 e 9.
