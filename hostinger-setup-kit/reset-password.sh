#!/usr/bin/env bash
# ==============================================================================
# DeskcommCRM — Redefinição de Senha de Usuário (Hostinger / EasyPanel)
# ==============================================================================
# Uso:
#   bash hostinger-setup-kit/reset-password.sh usuario@empresa.com
# ==============================================================================

source "$(dirname "$0")/_common.sh"
enter_project

EMAIL="${1:-}"
[ -n "$EMAIL" ] || die "Uso: bash hostinger-setup-kit/reset-password.sh <email-do-usuario>"

log_step "Localizando usuário $EMAIL..."

uid="$(owner_id_by_email "$EMAIL")"
[ -n "$uid" ] || die "Usuário com o e-mail '$EMAIL' não foi encontrado."

log_ok "Usuário identificado (ID: $uid)"

read -r -s -p "Digite a nova senha para $EMAIL: " NOVA_SENHA
echo
[ -n "$NOVA_SENHA" ] || die "A senha não pode ser vazia."

log_step "Redefinindo senha..."

REDEFINIDO=0

# Método 1: Via Admin API do GoTrue/Supabase
if [ -n "$NEXT_PUBLIC_SUPABASE_URL" ] && [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  HTTP_STATUS="$(curl -s -o /dev/null -w "%{http_code}" -X PUT "${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${uid}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"password\":\"${NOVA_SENHA}\"}" || echo "000")"

  if [ "$HTTP_STATUS" = "200" ]; then
    REDEFINIDO=1
  fi
fi

# Método 2: Fallback direto via SQL caso a API não esteja aberta
if [ "$REDEFINIDO" -eq 0 ]; then
  if psql_run <<SQL >/dev/null 2>&1
update auth.users
set encrypted_password = crypt('${NOVA_SENHA}', gen_salt('bf')),
    updated_at = now()
where id = '${uid}';
SQL
  then
    REDEFINIDO=1
  fi
fi

if [ "$REDEFINIDO" -eq 1 ]; then
  log_ok "Senha redefinida com sucesso para o usuário $EMAIL!"
  printf "\nVocê já pode acessar o CRM normalmente com a nova senha.\n\n"
else
  die "Não foi possível redefinir a senha. Verifique as credenciais do .env ou a conexão com o banco."
fi
