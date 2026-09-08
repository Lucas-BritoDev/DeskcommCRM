#!/usr/bin/env bash
# ==============================================================================
# DeskcommCRM — Restauração de Banco de Dados (Hostinger / EasyPanel)
# ==============================================================================
# Uso:
#   bash hostinger-setup-kit/restore.sh backups/db-20260908-120000.sql.gz
#   bash hostinger-setup-kit/restore.sh backups/db-20260908-120000.sql.gz --db-url "postgresql://..."
# ==============================================================================

source "$(dirname "$0")/_common.sh"
enter_project

DUMP="${1:-}"

# Processar flags
while [ $# -gt 0 ]; do
  case "$1" in
    --db-url) shift; CUSTOM_DB_URL="${1:-}" ;;
    -h|--help)
      echo "Uso: bash hostinger-setup-kit/restore.sh <caminho-do-arquivo.sql.gz> [--db-url <url>]"
      exit 0
      ;;
  esac
  shift
done

[ -n "$DUMP" ] && [ -f "$DUMP" ] || die "Arquivo de dump não encontrado. Uso: restore.sh <arquivo.sql.gz>"

log_warn "ATENÇÃO: Esta operação irá SOBRESCREVER os dados do banco atual pelo backup!"
printf "Arquivo a restaurar: %b%s%b\n" "$C_BLD" "$DUMP" "$C_RST"
read -r -p "Digite 'RESTAURAR' para confirmar: " confirmacao

if [ "$confirmacao" != "RESTAURAR" ]; then
  die "Operação cancelada pelo usuário."
fi

log_step "Restaurando banco de dados a partir de $DUMP"

if [[ "$DUMP" == *.gz ]]; then
  gunzip -c "$DUMP" | psql_run
else
  psql_run < "$DUMP"
fi

log_ok "Banco de dados restaurado com sucesso!"
printf "\n%bDica pós-restauração:%b No EasyPanel, reinicie o serviço do CRM para recarregar o cache.\n\n" "$C_YLW$C_BLD" "$C_RST"
