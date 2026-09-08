#!/usr/bin/env bash
# ==============================================================================
# DeskcommCRM — Utilitários Comuns (Hostinger / EasyPanel)
# ==============================================================================

set -eo pipefail

# ── Cores e Formatação ────────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_RST="\033[0m"
  C_BLD="\033[1m"
  C_GRN="\033[32m"
  C_YLW="\033[33m"
  C_RED="\033[31m"
  C_CYN="\033[36m"
  C_BLU="\033[34m"
else
  C_RST=""; C_BLD=""; C_GRN=""; C_YLW=""; C_RED=""; C_CYN=""; C_BLU=""
fi

log_step() { printf "\n%b==> %b%s%b\n" "$C_CYN$C_BLD" "$C_RST$C_BLD" "$1" "$C_RST"; }
log_ok()   { printf "  %b✓%b %s\n" "$C_GRN" "$C_RST" "$1"; }
log_warn() { printf "  %b⚠%b %s\n" "$C_YLW" "$C_RST" "$1"; }
log_err()  { printf "  %b✗%b %s\n" "$C_RED" "$C_RST" "$1" >&2; }
die()      { log_err "$1"; exit 1; }

# ── Diretório do Projeto ──────────────────────────────────────────────────────
KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PROJECT_DIR="$(cd "$KIT_DIR/.." && pwd)"

enter_project() {
  cd "$PROJECT_DIR" || die "Não foi possível acessar a pasta do projeto em $PROJECT_DIR"
}

# ── Carregamento de Variáveis do .env ──────────────────────────────────────────
load_env() {
  enter_project
  if [ -f "$PROJECT_DIR/.env" ]; then
    # Extração de variáveis essenciais sem eval para não quebrar com caracteres especiais
    [ -z "$SUPABASE_DB_ADMIN_URL" ] && SUPABASE_DB_ADMIN_URL="$(grep -E '^SUPABASE_DB_ADMIN_URL=' "$PROJECT_DIR/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
    [ -z "$SUPABASE_DB_URL" ]       && SUPABASE_DB_URL="$(grep -E '^SUPABASE_DB_URL=' "$PROJECT_DIR/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
    [ -z "$DATABASE_URL" ]          && DATABASE_URL="$(grep -E '^DATABASE_URL=' "$PROJECT_DIR/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
    [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] && NEXT_PUBLIC_SUPABASE_URL="$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$PROJECT_DIR/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
    [ -z "$SUPABASE_SERVICE_ROLE_KEY" ] && SUPABASE_SERVICE_ROLE_KEY="$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$PROJECT_DIR/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
    [ -z "$EASYPANEL_WEBHOOK_URL" ] && EASYPANEL_WEBHOOK_URL="$(grep -E '^EASYPANEL_WEBHOOK_URL=' "$PROJECT_DIR/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
  fi
}

# ── Resolução de URL do Banco de Dados ─────────────────────────────────────────
url_do_schema() {
  load_env
  local url="${CUSTOM_DB_URL:-${SUPABASE_DB_ADMIN_URL:-${SUPABASE_DB_URL:-${DATABASE_URL:-}}}}"
  if [ -z "$url" ]; then
    die "Nenhuma connection string de banco encontrada.
Defina SUPABASE_DB_ADMIN_URL ou DATABASE_URL no seu .env ou passe via --db-url."
  fi
  printf '%s' "$url"
}

# ── Execução de SQL (psql via docker ou local) ─────────────────────────────────
psql_run() {
  local db_url
  db_url="$(url_do_schema)"

  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    docker run --rm -i postgres:17-alpine psql "$db_url" -v ON_ERROR_STOP=1 "$@"
  elif command -v psql >/dev/null 2>&1; then
    psql "$db_url" -v ON_ERROR_STOP=1 "$@"
  else
    die "Nem 'docker' nem 'psql' foram encontrados no ambiente para executar comandos no banco."
  fi
}

# ── Busca de ID de Usuário por E-mail no Supabase ─────────────────────────────
owner_id_by_email() {
  load_env
  local email="$1" uid=""
  [ -n "$email" ] || return 1

  # Tentativa 1: Via Admin API do GoTrue/Supabase (se credenciais estiverem disponíveis)
  if [ -n "$NEXT_PUBLIC_SUPABASE_URL" ] && [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    local resp esc
    resp="$(curl -fsS "${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?filter=${email}" \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" 2>/dev/null || true)"
    if [ -n "$resp" ]; then
      esc="$(printf '%s' "$email" | sed 's/[.[\*^$]/\\&/g')"
      uid="$(printf '%s' "$resp" \
        | grep -o "\"id\":\"[0-9a-f-]\{36\}\",\"aud\":\"[^\"]*\",\"role\":\"[^\"]*\",\"email\":\"${esc}\"" \
        | head -1 | sed 's/^"id":"//;s/".*//' || true)"
    fi
  fi

  # Tentativa 2: Direto via banco de dados SQL (mais confiável caso a API não esteja aberta)
  if [ -z "$uid" ]; then
    local db_url
    if db_url="$(url_do_schema 2>/dev/null)" && [ -n "$db_url" ]; then
      uid="$(psql_run -tAc "select id from auth.users where lower(email) = lower('${email}') limit 1;" 2>/dev/null || true)"
    fi
  fi

  printf '%s' "$uid"
}
