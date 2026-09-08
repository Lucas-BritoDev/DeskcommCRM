#!/usr/bin/env bash
# ==============================================================================
# DeskcommCRM — Backup de Banco de Dados e Sessões WhatsApp (Hostinger / EasyPanel)
# ==============================================================================
# Uso:
#   bash hostinger-setup-kit/backup.sh
#   bash hostinger-setup-kit/backup.sh --db-url "postgresql://..."
# ==============================================================================

source "$(dirname "$0")/_common.sh"
enter_project

# Processar flags
while [ $# -gt 0 ]; do
  case "$1" in
    --db-url) shift; CUSTOM_DB_URL="${1:-}" ;;
    -h|--help)
      echo "Uso: bash hostinger-setup-kit/backup.sh [--db-url <url>]"
      exit 0
      ;;
  esac
  shift
done

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
mkdir -p "$BACKUP_DIR"
ts="$(date +%Y%m%d-%H%M%S)"

log_step "1/3: Backup do Banco de Dados Postgres"
DB_FILE="$BACKUP_DIR/db-$ts.sql.gz"

db_url="$(url_do_schema)"

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  docker run --rm postgres:17-alpine pg_dump "$db_url" --no-owner --no-privileges \
    | gzip > "$DB_FILE"
elif command -v pg_dump >/dev/null 2>&1; then
  pg_dump "$db_url" --no-owner --no-privileges | gzip > "$DB_FILE"
else
  die "Nem 'docker' nem 'pg_dump' foram encontrados para realizar o dump do banco."
fi

if [ -s "$DB_FILE" ]; then
  log_ok "Banco salvo em: $DB_FILE ($(du -h "$DB_FILE" 2>/dev/null | cut -f1 || echo 'ok'))"
else
  rm -f "$DB_FILE"
  die "Falha ao gerar o arquivo de backup do banco de dados (o arquivo gerado está vazio)."
fi

log_step "2/3: Backup das Sessões do WhatsApp (WAHA)"
WAHA_FILE="$BACKUP_DIR/waha-$ts.tgz"

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  # Procura o volume do WAHA pelo nome ou padrão
  vol="$(docker volume ls --format '{{.Name}}' 2>/dev/null | grep -m1 -E 'waha-data|waha' || echo '')"
  if [ -n "$vol" ]; then
    docker run --rm -v "${vol}:/data:ro" -v "$BACKUP_DIR:/out" alpine:3.20 \
      tar czf "/out/waha-$ts.tgz" -C /data . 2>/dev/null \
      && log_ok "Sessões do WhatsApp salvas em: $WAHA_FILE" \
      || log_warn "Não foi possível arquivar o volume $vol."
  else
    log_warn "Volume do WAHA não encontrado localmente (se estiver em execução remota, o volume reside na VPS)."
  fi
else
  log_warn "Docker não ativo localmente; pulando backup do volume WAHA."
fi

log_step "3/3: Rotação de Backups Antigos (mantém os 14 mais recentes)"
find "$BACKUP_DIR" -name "db-*.sql.gz" -type f 2>/dev/null | sort -r | tail -n +15 | xargs -r rm -f 2>/dev/null || true
find "$BACKUP_DIR" -name "waha-*.tgz" -type f 2>/dev/null | sort -r | tail -n +15 | xargs -r rm -f 2>/dev/null || true
log_ok "Limpeza concluída."

printf "\n%b✓ Backup finalizado com sucesso em:%b %s\n\n" "$C_GRN$C_BLD" "$C_RST" "$BACKUP_DIR"
