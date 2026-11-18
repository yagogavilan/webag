# Runbook: recuperação de emergência do acesso de admin (SEC-094)

Uso: o único super admin perdeu o aparelho **e** os códigos de recuperação, ou nenhum outro super admin consegue fazer a redefinição pelo painel (SEC-093). Se existir outro super admin ativo com TOTP, use o painel: a CLI recusa.

## Pré-requisitos
- Acesso de shell ao servidor da API (SSH com chave + 2FA do console do provedor: este é o controle real).
- Acesso à caixa de e-mail **do admin alvo**: o link de reativação vai só para lá e nunca é impresso.

## Comando
```bash
docker compose exec api node dist/cli.js admin:reset-access \
  --email admin@exemplo.com --confirm-email admin@exemplo.com \
  --reason "Super admin único perdeu aparelho e códigos; identidade conferida por vídeo em AAAA-MM-DD" \
  [--dry-run] [--override-other-super-admins]
```
Em terminal interativo, omitir `--confirm-email` faz a CLI pedir o e-mail de novo. Rode antes com `--dry-run`.

## O que acontece
| Item | Efeito |
|---|---|
| Recusa | Alvo que não é admin ativo; e-mail de confirmação diferente; motivo < 20 caracteres; outro super admin ativo com TOTP (exceto `--override-other-super-admins`, que gera alerta extra a todos os super admins) |
| Efeito | Igual ao SEC-093: apaga segredo TOTP e códigos de recuperação, invalida a senha, revoga sessões, envia link de reativação (48 h, uso único, hash no banco) ao e-mail cadastrado. Não troca o e-mail do admin |
| Avisos | E-mail ao alvo e a todos os super admins |
| Auditoria | `audit_log`: `action=admin.access_reset_cli`, `actor_role=system_cli`, `after={actorType, osUser, host, override}`, motivo, alvo. Log `warn` sem o link |

## Depois
1. O admin abre o link, cria senha nova e configura o TOTP (guardando os 10 códigos de recuperação **fora do computador**).
2. Cadastrar um 2º super admin de confiança assim que possível (elimina a necessidade desta CLI).
3. Registrar o uso e o motivo em `docs/decisoes.md` se for produção.

## Teste (Onda 8, staging; resultado registrado pelo QA)
`--dry-run` não altera nada; com outro super admin recusa; com super admin único remove TOTP e senha e derruba sessões; saída do terminal e logs sem o link (`grep token=`); `curl` em `/admin-reset-access` devolve 404. Cobertos em `apps/api/test/break-glass.e2e-spec.ts`.
