---
name: nestjs-arquitetura-modular
description: Como estruturar e testar módulos NestJS 12 no Webag (DI, fronteiras entre módulos, validação Zod, guards, interceptors, filtros, transação por CLS, eventos, testes). Use ao criar um módulo, endpoint, guard/interceptor ou ao revisar acoplamento entre módulos.
---

# Anatomia de um módulo (`apps/api/src/modules/<dominio>`, ADR-007)
```
<dominio>.module.ts  <dominio>.controller.ts  <dominio>.service.ts  <dominio>.repository.ts
<dominio>.schemas.ts (Zod)  db/schema.ts (Drizzle)  domain/ (regras puras + *.spec.ts)  index.ts (API pública)
```
- **Controller** só traduz HTTP (parse, status, DTO). **Service** orquestra e aplica regra. **Repository** é o único que fala SQL. **`domain/`** são funções puras (preço, estoque, elegibilidade de troca): as mais fáceis de testar, onde mora a regra de negócio.
- `index.ts` exporta só o que outros módulos podem usar (um service/porta). `dependency-cruiser` no CI barra importar `db/schema` ou repository de outro módulo.

# Fronteiras e injeção de dependência
| Regra | Motivo |
|---|---|
| Módulo exporta **serviço**, nunca repository/tabela | Evita acoplamento por dados |
| Dependência circular (`forwardRef`) é sintoma | Quebre com evento de domínio (`@nestjs/event-emitter`) ou extraia um terceiro módulo |
| Provider singleton por padrão; **evitar escopo REQUEST** | Custo e propagação; use `nestjs-cls` para contexto da requisição (requestId, usuário, transação) |
| Dependência por token/interface para o que é externo (pagamento, e-mail, storage) | Troca por fake nos testes |
| Config só via `@nestjs/config` + schema Zod no boot | App não sobe com env inválida |
Efeitos colaterais (push, e-mail, socket, imagem) saem **depois do commit**: evento -> job BullMQ. Estado de pedido/financeiro muda na mesma transação.

# Pipeline da requisição (ordem real)
middleware -> **guards** -> interceptors (antes) -> **pipes** -> handler -> interceptors (depois) -> **exception filters**.
| Peça | Faz | No Webag |
|---|---|---|
| Guard | Quem pode entrar | Autenticação (JWT), papel (`customer/merchant/admin`), permissões do admin, rate limit |
| Autorização por **recurso** | O pedido é deste usuário? A loja é deste lojista? | No **service** (com o dado carregado) ou guard de propriedade; 404 para recurso alheio (`contrato-api`) |
| Pipe | Valida/transforma entrada | Zod 4 via `StandardSchemaValidationPipe`, `z.strictObject` (campo extra é erro); schemas gerados do OpenAPI quando existirem (DT-014) |
| Interceptor | Transversal antes/depois | `requestId`, idempotência por `Idempotency-Key`, medição de duração, transação por requisição |
| Filter | Converte erro em resposta | Um filtro global produz `application/problem+json` (RFC 9457) com `code` estável |
Erros de negócio: lance `AppError` com `code` (nunca `throw new Error('texto')`); 5xx nunca vaza stack ou SQL.

# Validação e DTO
Um schema Zod por entrada; o tipo vem de `z.infer`. Limites explícitos (tamanho de string, tamanho de array, `max` em paginação). Nada de `any`; `unknown` + parse na borda. Validação duplicada controller/service é desperdício: valide na borda, confie nos tipos dentro.

# Transação por requisição
`nestjs-cls` + `@nestjs-cls/transactional` (adapter Drizzle): o repository usa a transação do contexto, sem passar `tx` por parâmetro. Operações que chamam serviço externo ficam **fora** dela (ver `postgres-postgis-performance`).

# Testes (Vitest 4, ADR-006)
- **Unitário:** `domain/` e services com repositórios falsos; sem Nest quando não precisa.
- **Módulo:** `Test.createTestingModule` com `overrideProvider` para portas externas.
- **E2E:** `supertest` + Testcontainers (mesma imagem PostGIS do compose); cobrir sucesso, validação, acesso indevido (outro usuário/papel) e idempotência. Teste de deriva do contrato contra `openapi.yaml`.
- Decorators/metadata em ESM: seguir o template oficial do Nest 12 para Vitest [HIPÓTESE: conferir a configuração de transformação do projeto antes de criar o primeiro e2e].

# Checklist de novo módulo/endpoint
- [ ] OpenAPI atualizado antes (`contrato-api`); rota com guard e permissão explícitos
- [ ] Autorização por recurso testada com usuário errado
- [ ] Regra em `domain/` com teste; service sem regra no controller
- [ ] Nenhum import cruzado de repository/tabela; `index.ts` mínimo
- [ ] Evento pós-commit para efeito colateral; erro com `code`
- [ ] Rate limit em rota pública/sensível; lista paginada

## Fontes e licença
- Documentação oficial do NestJS (conceitos de módulos, DI, ciclo de requisição) e `docs/arquitetura/adr/ADR-001` e `ADR-007` do próprio Webag. Conhecimento geral.
- Inspirado em kadajett/agent-nestjs-skills (`nestjs-best-practices`), consultada em 2026-11-22: licença não confirmada (LICENSE inacessível), **nenhum texto aproveitado**.
