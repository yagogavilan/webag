#!/bin/sh
# Rotina diária (chamada pelo cron): banco + arquivos. Termina com erro se qualquer parte falhar, e só avisa o monitor se tudo deu certo.
. /usr/local/lib/webag-backup.sh
rc=0
backup-postgres || rc=1
backup-storage || rc=1
if [ "$rc" -eq 0 ]; then
  log "rotina concluída com sucesso"
  [ -n "${BACKUP_HEARTBEAT_URL:-}" ] && { curl -fsS -m 15 --retry 3 -o /dev/null "$BACKUP_HEARTBEAT_URL" || log "aviso: não consegui chamar BACKUP_HEARTBEAT_URL"; }
else
  log "ERRO: rotina de backup terminou com falha (veja as linhas acima)" >&2
fi
exit "$rc"
