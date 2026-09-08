#!/usr/bin/env bash
# ==============================================================================
# DeskcommCRM — Agente de Atualização Automática pela UI (Hostinger / EasyPanel)
# ==============================================================================
# Este script roda por cron (ex: a cada 5 minutos) na VPS da Hostinger.
#
# O que ele faz:
#   1. Consulta o repositório oficial (upstream) para descobrir novas versões.
#   2. Envia um heartbeat para a API do CRM informando a versão atual e a nova.
#      (É isso que faz acender o botão "Nova versão" no canto inferior da sidebar).
#   3. Se o dono do CRM clicar em "Atualizar agora" na tela, a API avisa este agente.
#   4. O agente executa o 'hostinger-setup-kit/update.sh', que aplica o código novo
#      com as suas customizações em cima, roda o baseline no banco e atualiza os contêineres.
#   5. Reporta o sucesso de volta para a tela do CRM.
#
# Configuração no Crontab da VPS:
#   crontab -e
#   Adicione a linha:
#   */5 * * * * cd /caminho/DeskcommCRM && bash hostinger-setup-kit/agent.sh >/dev/null 2>&1
# ==============================================================================

source "$(dirname "$0")/_common.sh"
enter_project
load_env

SECRET="${INTERNAL_CRON_SECRET:-${INTERNAL_SECRET:-}}"
[ -n "$SECRET" ] || exit 0

APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
API="${APP_URL%/}/api/v1/system/agent"
LOG="${PROJECT_DIR}/.update.log"
ERRLOG="${PROJECT_DIR}/.update-agent.log"

log_agent_err() {
  printf '%s [agent] %s\n' "$(date -u +%FT%TZ)" "$1" >> "$ERRLOG" 2>/dev/null || true
  { tail -n 200 "$ERRLOG" > "${ERRLOG}.tmp" && mv "${ERRLOG}.tmp" "$ERRLOG"; } 2>/dev/null || true
}

# Envia requisição para a API do CRM
post_api() {
  local out http_code body
  out="$(curl -sS -X POST "$API" \
    -H "Authorization: Bearer ${SECRET}" \
    -H 'Content-Type: application/json' \
    --max-time 20 -d "$1" \
    -w $'\n%{http_code}' 2>&1)" || true
  http_code="${out##*$'\n'}"
  body="${out%$'\n'*}"
  case "$http_code" in
    2[0-9][0-9]) printf '%s' "$body" ;;
    *) log_agent_err "POST ${API} -> ${out}" ;;
  esac
}

json_get() {
  printf '%s' "$1" | tr ',' '\n' | grep -o "\"$2\":[^,}]*" | head -1 | cut -d: -f2- | tr -d '" '
}

# Escapa texto para JSON válido sem dependência de jq
esc_json() {
  printf '%s' "$1" \
    | LC_ALL=C tr -d '\000-\010\013\014\015\016-\037\177' \
    | LC_ALL=C tr '\t\n' '\002\001' \
    | LC_ALL=C sed 's/\\/\\\\/g; s/"/\\"/g' \
    | LC_ALL=C sed $'s/\002/\\\\t/g; s/\001/\\\\n/g'
}

# ── 1. Descobrir versão instalada e última versão no upstream ──────────────────
# Tenta buscar tags do upstream (original) ou origin
git fetch upstream --tags --quiet 2>/dev/null || git fetch origin --tags --quiet 2>/dev/null || true

CURRENT_TAG="$(git describe --tags --exact-match HEAD 2>/dev/null || true)"
CURRENT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo '?')"
LATEST_TAG="$(git tag -l 'v*' --sort=-v:refname 2>/dev/null | head -1 || true)"

if [ -n "$CURRENT_TAG" ]; then
  CURRENT="$CURRENT_TAG"
  OFF_RELEASE=false
else
  CURRENT="$CURRENT_SHA"
  OFF_RELEASE=true
fi

CHANGELOG=""
if [ -n "$LATEST_TAG" ]; then
  CHANGELOG="$(git show "${LATEST_TAG}:CHANGELOG.md" 2>/dev/null | head -c 30000 || true)"
  if command -v iconv >/dev/null 2>&1; then
    CHANGELOG="$(printf '%s' "$CHANGELOG" | iconv -f UTF-8 -t UTF-8 -c 2>/dev/null || true)"
  fi
fi

# ── 2. Enviar Heartbeat à API do CRM ──────────────────────────────────────────
PAYLOAD="$(cat <<EOF
{
  "kind": "heartbeat",
  "current_version": "$(esc_json "$CURRENT")",
  "current_sha": "$(esc_json "$CURRENT_SHA")",
  "off_release": $OFF_RELEASE,
  "latest_version": "$(esc_json "${LATEST_TAG:-$CURRENT}")",
  "compare_failed": false,
  "has_known_release": true,
  "changelog": "$(esc_json "$CHANGELOG")"
}
EOF
)"

RESP="$(post_api "$PAYLOAD")"
[ -n "$RESP" ] || exit 0

UPDATE_REQUESTED="$(json_get "$RESP" "update_requested")"
RUN_ID="$(json_get "$RESP" "run_id")"

# ── 3. Se houver pedido de atualização disparado pela tela ───────────────────
if [ "$UPDATE_REQUESTED" = "true" ] && [ -n "$RUN_ID" ]; then
  log_agent_err "Iniciando atualização solicitada pela UI (Run ID: $RUN_ID)..."

  # Notifica progresso inicial
  post_api "{\"kind\":\"run_progress\",\"run_id\":\"$RUN_ID\",\"step\":\"codigo\"}" >/dev/null 2>&1 || true

  # Executa o script de atualização do EasyPanel
  UPDATE_STATUS="success"
  if ! bash "$KIT_DIR/update.sh" > "$LOG" 2>&1; then
    UPDATE_STATUS="failed"
    log_agent_err "Falha na execução do update.sh (veja $LOG)"
  fi

  LOG_TAIL="$(esc_json "$(tail -40 "$LOG" 2>/dev/null || echo 'Sem logs.')")"

  # Notifica resultado final para a UI
  post_api "{\"kind\":\"run_result\",\"run_id\":\"$RUN_ID\",\"status\":\"$UPDATE_STATUS\",\"log_tail\":\"$LOG_TAIL\"}" >/dev/null 2>&1 || true
fi
