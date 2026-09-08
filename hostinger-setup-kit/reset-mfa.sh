#!/usr/bin/env bash
# ==============================================================================
# DeskcommCRM — Remoção de Fatores MFA / 2FA (Hostinger / EasyPanel)
# ==============================================================================
# Uso de emergência quando o usuário perde o app autenticador (TOTP).
# No próximo login, o usuário poderá entrar e cadastrar um novo autenticador.
#
# Uso:
#   bash hostinger-setup-kit/reset-mfa.sh usuario@empresa.com
# ==============================================================================

source "$(dirname "$0")/_common.sh"
enter_project

EMAIL="${1:-}"
[ -n "$EMAIL" ] || die "Uso: bash hostinger-setup-kit/reset-mfa.sh <email-do-usuario>"

log_warn "Esta ação removerá TODOS os fatores de duplo fator (MFA/TOTP) de $EMAIL."
read -r -p "Deseja continuar? (s/N): " confirmacao

case "$confirmacao" in
  [sS]|[sS][iI][mM]|[yY]|[yY][eE][sS]) ;;
  *) die "Operação cancelada pelo usuário." ;;
esac

log_step "Removendo fatores de autenticação MFA para $EMAIL..."

psql_run <<SQL
delete from auth.mfa_factors
where user_id in (select id from auth.users where lower(email) = lower('${EMAIL}'));
SQL

log_ok "MFA removido com sucesso!"
printf "\nNo próximo login, o usuário %b%s%b poderá entrar e reconfigurar seu autenticador.\n\n" "$C_BLD" "$EMAIL" "$C_RST"
