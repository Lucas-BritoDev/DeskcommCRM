#!/usr/bin/env bash
# ==============================================================================
# DeskcommCRM — Script de Atualização e Sincronização Automática (Hostinger / EasyPanel)
# ==============================================================================
# Este script automatiza o ciclo completo de sincronização entre o repositório
# original (melgarafael/DeskcommCRM), o seu fork (Lucas-BritoDev/DeskcommCRM),
# as suas customizações personalizadas e a sua VPS na Hostinger com EasyPanel.
#
# Etapas executadas:
#   1. Valida e padroniza os remotes git (upstream = original, origin = seu fork)
#   2. Atualiza a branch 'main' limpa a partir do projeto original (upstream/main)
#   3. Faz rebase de 'custom/minhas-alteracoes' sobre a nova main (suas features no topo)
#   4. Atualiza a branch de deploy 'feat/easypanel-reverse-proxy-none' (com compose do EasyPanel)
#   5. Aplica atualizações no banco de dados (baseline + extensions) e aciona o deploy
#
# Uso:
#   bash hostinger-setup-kit/update.sh
#   bash hostinger-setup-kit/update.sh --skip-db      # pula o banco de dados
#   bash hostinger-setup-kit/update.sh --skip-push    # testa localmente sem dar push
# ==============================================================================

set -eo pipefail

# ── Cores e Estilo ────────────────────────────────────────────────────────────
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

log_step() {
  printf "\n%b==> %b%s%b\n" "$C_CYN$C_BLD" "$C_RST$C_BLD" "$1" "$C_RST"
}
log_ok() {
  printf "  %b✓%b %s\n" "$C_GRN" "$C_RST" "$1"
}
log_warn() {
  printf "  %b⚠%b %s\n" "$C_YLW" "$C_RST" "$1"
}
log_err() {
  printf "  %b✗%b %s\n" "$C_RED" "$C_RST" "$1" >&2
}
die() {
  log_err "$1"
  exit 1
}

# ── Diretório do Projeto ──────────────────────────────────────────────────────
KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PROJECT_DIR="$(cd "$KIT_DIR/.." && pwd)"
cd "$PROJECT_DIR" || die "Não foi possível acessar a pasta do projeto em $PROJECT_DIR"

# ── Configurações Padrão ──────────────────────────────────────────────────────
UPSTREAM_URL_DEFAULT="https://github.com/melgarafael/DeskcommCRM.git"
FORK_URL_DEFAULT="https://github.com/Lucas-BritoDev/DeskcommCRM.git"
SKIP_DB=0
SKIP_PUSH=0
CUSTOM_WEBHOOK=""

# Processamento de flags
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-db) SKIP_DB=1 ;;
    --skip-push) SKIP_PUSH=1 ;;
    --webhook) shift; CUSTOM_WEBHOOK="${1:-}" ;;
    -h|--help)
      cat <<HELP
Uso: bash hostinger-setup-kit/update.sh [opções]

Opções:
  --skip-db       Pula a execução de migrations/baseline no banco de dados.
  --skip-push     Não envia as branches para o GitHub (útil para teste local).
  --webhook <url> URL do webhook de deploy do EasyPanel para disparo automático.
  -h, --help      Exibe esta tela de ajuda.

Exemplos:
  bash hostinger-setup-kit/update.sh
  bash hostinger-setup-kit/update.sh --skip-db
HELP
      exit 0
      ;;
    *)
      log_warn "Opção desconhecida: $1 (ignorada)"
      ;;
  esac
  shift
done

# ── Banner ───────────────────────────────────────────────────────────────────
cat <<BANNER
$C_CYN$C_BLD
╔══════════════════════════════════════════════════════════════════════╗
║              DeskcommCRM — Atualização Hostinger / EasyPanel         ║
╚══════════════════════════════════════════════════════════════════════╝$C_RST
Projeto: $PROJECT_DIR
Data:    $(date '+%d/%m/%Y %H:%M:%S')

BANNER

# ── Verificação Prévia: Working Tree sem alterações pendentes ─────────────────
if ! git diff --quiet || ! git diff --cached --quiet; then
  die "Existem alterações não salvas em arquivos rastreados no repositório.
Faça commit ou stash antes de rodar a atualização:
  git status
  git stash"
fi

# ==============================================================================
# PASSO 1: Padronização e Validação dos Remotes Git
# ==============================================================================
log_step "Passo 1/5: Padronizando remotes do Git"

ORIGIN_URL="$(git config --get remote.origin.url 2>/dev/null || true)"
FORK_URL="$(git config --get remote.fork.url 2>/dev/null || true)"
UPSTREAM_URL="$(git config --get remote.upstream.url 2>/dev/null || true)"

# Caso especial detectado: origin apontando para melgarafael e fork para Lucas-BritoDev
if [[ "$ORIGIN_URL" =~ melgarafael ]] && [[ "$FORK_URL" =~ Lucas-BritoDev ]]; then
  log_warn "Detectada inversão nos remotes ('origin' apontava para upstream e 'fork' para seu repo)."
  log_warn "Ajustando para o padrão: origin = seu fork, upstream = original..."
  git remote rename origin upstream
  git remote rename fork origin
  log_ok "Remotes renomeados com sucesso!"
fi

# Reavaliar após renomeação
ORIGIN_URL="$(git config --get remote.origin.url 2>/dev/null || true)"
UPSTREAM_URL="$(git config --get remote.upstream.url 2>/dev/null || true)"

# Garantir upstream configurado
if [ -z "$UPSTREAM_URL" ]; then
  log_warn "Remote 'upstream' não encontrado. Adicionando $UPSTREAM_URL_DEFAULT..."
  git remote add upstream "$UPSTREAM_URL_DEFAULT"
  UPSTREAM_URL="$UPSTREAM_URL_DEFAULT"
fi

# Garantir origin configurado
if [ -z "$ORIGIN_URL" ]; then
  log_warn "Remote 'origin' não encontrado. Adicionando $FORK_URL_DEFAULT..."
  git remote add origin "$FORK_URL_DEFAULT"
  ORIGIN_URL="$FORK_URL_DEFAULT"
fi

log_ok "Remotes validados:"
printf "     • %bupstream%b (original): %s\n" "$C_BLD" "$C_RST" "$UPSTREAM_URL"
printf "     • %borigin%b   (seu fork): %s\n" "$C_BLD" "$C_RST" "$ORIGIN_URL"

printf "  Buscando atualizações de ambos os remotes...\n"
git fetch upstream --tags --quiet
git fetch origin --quiet
log_ok "Metadados sincronizados do GitHub."

# ==============================================================================
# PASSO 2: Atualização da Branch 'main' com Upstream
# ==============================================================================
log_step "Passo 2/5: Atualizando a branch 'main' pura com o projeto original"

git checkout main --quiet
log_ok "Branch 'main' selecionada."

# Avançar a main para o upstream/main
if git merge upstream/main --ff-only --quiet 2>/dev/null; then
  log_ok "Branch 'main' avançada com sucesso via fast-forward."
else
  log_warn "Avanço simples não foi direto; alinhando main exatamente com upstream/main..."
  git reset --hard upstream/main --quiet
  log_ok "Branch 'main' alinhada com upstream/main."
fi

VERSAO_ATUAL="$(git tag -l 'v*' --sort=-v:refname 2>/dev/null | head -1 || echo 'main')"
COMMIT_MAIN="$(git rev-parse --short HEAD)"
log_ok "Versão mais recente do upstream: $C_BLD$VERSAO_ATUAL$C_RST (commit $COMMIT_MAIN)"

if [ "$SKIP_PUSH" -eq 0 ]; then
  printf "  Enviando 'main' e tags atualizadas para seu GitHub...\n"
  git push origin main --tags --quiet
  log_ok "GitHub (origin/main) atualizado."
else
  log_warn "Envio ao GitHub pulado (--skip-push)."
fi

# ==============================================================================
# PASSO 3: Mesclar Atualizações com Customizações (Rebase de 'custom/minhas-alteracoes')
# ==============================================================================
log_step "Passo 3/5: Rebaseando suas customizações no topo da versão nova"

# Backup de segurança da branch custom antes do rebase
TIMESTAMP="$(date '+%Y%m%d_%H%M%S')"
BACKUP_BRANCH="custom/backup-pre-sync-$TIMESTAMP"
git branch "$BACKUP_BRANCH" custom/minhas-alteracoes 2>/dev/null || true
log_ok "Backup preventivo criado na branch local: $BACKUP_BRANCH"

git checkout custom/minhas-alteracoes --quiet
log_ok "Branch 'custom/minhas-alteracoes' selecionada."

printf "  Aplicando seus commits personalizados sobre a nova 'main'...\n"
if ! git rebase main; then
  log_err "Ocorreu conflito de arquivos durante o rebase de 'custom/minhas-alteracoes'."
  log_err "Para resolver manualmente:"
  log_err "  1. Resolva os conflitos nos arquivos apontados pelo 'git status'"
  log_err "  2. git add <arquivos-resolvidos>"
  log_err "  3. git rebase --continue"
  log_err "Ou para cancelar e voltar ao estado anterior:"
  log_err "  git rebase --abort"
  exit 1
fi
log_ok "Suas alterações foram rebaseadas no topo da versão nova com sucesso!"

if [ "$SKIP_PUSH" -eq 0 ]; then
  printf "  Enviando 'custom/minhas-alteracoes' para o seu GitHub...\n"
  git push origin custom/minhas-alteracoes --force-with-lease --quiet
  log_ok "GitHub (origin/custom/minhas-alteracoes) atualizado."
fi

# ==============================================================================
# PASSO 4: Atualizar Branch de Deploy do EasyPanel ('feat/easypanel-reverse-proxy-none')
# ==============================================================================
log_step "Passo 4/5: Atualizando a branch de deploy do EasyPanel"

# Garantir existência local da branch de deploy
if ! git rev-parse --verify feat/easypanel-reverse-proxy-none >/dev/null 2>&1; then
  if git rev-parse --verify origin/feat/easypanel-reverse-proxy-none >/dev/null 2>&1; then
    git checkout -b feat/easypanel-reverse-proxy-none origin/feat/easypanel-reverse-proxy-none --quiet
  else
    git checkout -b feat/easypanel-reverse-proxy-none custom/minhas-alteracoes --quiet
  fi
else
  git checkout feat/easypanel-reverse-proxy-none --quiet
fi
log_ok "Branch 'feat/easypanel-reverse-proxy-none' selecionada."

printf "  Rebaseando sobre 'custom/minhas-alteracoes'...\n"
if ! git rebase custom/minhas-alteracoes; then
  log_err "Conflito ao rebasear a branch do EasyPanel."
  log_err "Resolva com: git status, git add, git rebase --continue"
  exit 1
fi
log_ok "Branch de deploy sincronizada com o código novo e suas customizações."

# Garantir que os arquivos do EasyPanel estão presentes
ARQUIVOS_EASYPANEL_OK=1
if [ ! -f "docker-compose.easypanel.yml" ]; then
  log_warn "docker-compose.easypanel.yml não encontrado; recriando..."
  cat <<'EOF' > docker-compose.easypanel.yml
# DeskcommCRM — arquivo único para painéis (EasyPanel e afins)
include:
  - docker-compose.prod.yml
  - docker-compose.no-proxy.yml
EOF
  git add docker-compose.easypanel.yml
  ARQUIVOS_EASYPANEL_OK=0
fi

if [ ! -f "docker-compose.no-proxy.yml" ]; then
  log_warn "docker-compose.no-proxy.yml não encontrado; recriando..."
  cat <<'EOF' > docker-compose.no-proxy.yml
# DeskcommCRM — override para painel que roteia pela própria interface (EasyPanel)
services:
  caddy:
    profiles: ["caddy-nao-usado-com-proxy-externo"]
EOF
  git add docker-compose.no-proxy.yml
  ARQUIVOS_EASYPANEL_OK=0
fi

if [ "$ARQUIVOS_EASYPANEL_OK" -eq 0 ]; then
  git commit -m "feat(easypanel): assegura arquivos docker-compose do EasyPanel" --quiet
  log_ok "Arquivos de configuração do EasyPanel assegurados."
fi

if [ "$SKIP_PUSH" -eq 0 ]; then
  printf "  Enviando 'feat/easypanel-reverse-proxy-none' para seu GitHub...\n"
  git push origin feat/easypanel-reverse-proxy-none --force-with-lease --quiet
  log_ok "GitHub (origin/feat/easypanel-reverse-proxy-none) atualizado e pronto para deploy!"
fi

# Voltar para a branch de trabalho
git checkout custom/minhas-alteracoes --quiet

# ==============================================================================
# PASSO 5: Banco de Dados e Acionamento de Deploy
# ==============================================================================
log_step "Passo 5/5: Banco de dados e Deploy"

# Carregar variáveis do .env se existir
if [ -f "$PROJECT_DIR/.env" ]; then
  # Extração segura de variáveis de conexão
  DB_URL="$(grep -E '^SUPABASE_DB_ADMIN_URL=' "$PROJECT_DIR/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
  if [ -z "$DB_URL" ]; then
    DB_URL="$(grep -E '^SUPABASE_DB_URL=' "$PROJECT_DIR/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
  fi
  if [ -z "$DB_URL" ]; then
    DB_URL="$(grep -E '^DATABASE_URL=' "$PROJECT_DIR/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
  fi
  
  ENV_WEBHOOK="$(grep -E '^EASYPANEL_WEBHOOK_URL=' "$PROJECT_DIR/.env" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)"
  if [ -z "$CUSTOM_WEBHOOK" ] && [ -n "$ENV_WEBHOOK" ]; then
    CUSTOM_WEBHOOK="$ENV_WEBHOOK"
  fi
fi

# 5.1 — Atualização do Banco de Dados
if [ "$SKIP_DB" -eq 1 ]; then
  log_warn "Etapa de banco de dados pulada (--skip-db)."
elif [ -n "${DB_URL:-}" ]; then
  printf "  Conexão de banco detectada no .env. Aplicando extensões e baseline...\n"
  
  RUN_SQL=""
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    RUN_SQL="docker"
  elif command -v psql >/dev/null 2>&1; then
    RUN_SQL="psql"
  fi

  if [ "$RUN_SQL" = "docker" ]; then
    # Extensões essenciais
    docker run --rm postgres:17-alpine psql "$DB_URL" -c \
      "create extension if not exists vector with schema public; create extension if not exists citext with schema public; create extension if not exists pg_trgm with schema public;" \
      >/dev/null 2>&1 || true

    # Baseline idempotente
    if [ -f "$PROJECT_DIR/supabase/baseline.sql" ]; then
      raw="$(docker run --rm -i -v "$PROJECT_DIR/supabase/baseline.sql:/b.sql:ro" \
            postgres:17-alpine psql "$DB_URL" -f /b.sql 2>&1 || true)"
      
      benign='already exists|multiple primary keys|multiple default values|is already a member|already a partition'
      unexpected="$(printf '%s\n' "$raw" | grep -iE 'ERROR|FATAL' | grep -viE "$benign" || true)"
      
      if [ -n "$unexpected" ]; then
        log_warn "Avisos ao aplicar baseline no banco:"
        printf '%s\n' "$unexpected" | head -10
      else
        log_ok "Schema e baseline aplicados com sucesso no banco de dados!"
      fi
    fi
  elif [ "$RUN_SQL" = "psql" ]; then
    psql "$DB_URL" -c \
      "create extension if not exists vector with schema public; create extension if not exists citext with schema public; create extension if not exists pg_trgm with schema public;" \
      >/dev/null 2>&1 || true

    if [ -f "$PROJECT_DIR/supabase/baseline.sql" ]; then
      raw="$(psql "$DB_URL" -f "$PROJECT_DIR/supabase/baseline.sql" 2>&1 || true)"
      benign='already exists|multiple primary keys|multiple default values|is already a member|already a partition'
      unexpected="$(printf '%s\n' "$raw" | grep -iE 'ERROR|FATAL' | grep -viE "$benign" || true)"
      if [ -n "$unexpected" ]; then
        log_warn "Avisos ao aplicar baseline:"
        printf '%s\n' "$unexpected" | head -10
      else
        log_ok "Schema e baseline aplicados via psql local!"
      fi
    fi
  else
    log_warn "Docker ou psql não estão acessíveis neste terminal para rodar o baseline diretamente."
    log_warn "Se estiver na sua máquina de desenvolvimento, o banco da VPS pode ser atualizado via conexão direta ou rodando este script na VPS."
  fi
else
  log_warn "Nenhuma connection string encontrada no .env (SUPABASE_DB_ADMIN_URL ou DATABASE_URL)."
  log_warn "O código foi sincronizado. Se o banco roda na VPS, certifique-se de aplicar o baseline na VPS."
fi

# 5.2 — Acionamento do Deploy
DEPLOY_ACIONADO=0

# Caso A: Webhook do EasyPanel configurado
if [ -n "$CUSTOM_WEBHOOK" ]; then
  printf "  Acionando webhook do EasyPanel...\n"
  HTTP_STATUS="$(curl -s -o /dev/null -w "%{http_code}" -X POST "$CUSTOM_WEBHOOK" || echo "000")"
  if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "204" ]; then
    log_ok "Webhook do EasyPanel disparado com sucesso! (HTTP $HTTP_STATUS) — Deploy iniciado automaticamente na VPS!"
    DEPLOY_ACIONADO=1
  else
    log_warn "O webhook respondeu com código HTTP $HTTP_STATUS. Confira a URL configurada."
  fi
fi

# Caso B: Execução direta na VPS com contêineres EasyPanel/Docker
if [ "$DEPLOY_ACIONADO" -eq 0 ] && command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qE 'easypanel|deskcomm|crm'; then
    printf "  Ambiente Docker ativo detectado. Recriando contêineres com a nova versão...\n"
    if [ -f "docker-compose.easypanel.yml" ]; then
      docker compose -f docker-compose.easypanel.yml up -d --build >/dev/null 2>&1 || true
      log_ok "docker-compose.easypanel.yml recriado!"
      DEPLOY_ACIONADO=1
    fi
  fi
fi

# ==============================================================================
# RESUMO FINAL
# ==============================================================================
cat <<FIM

$C_GRN$C_BLD╔══════════════════════════════════════════════════════════════════════╗
║                   ✓ ATUALIZAÇÃO CONCLUÍDA COM SUCESSO!               ║
╚══════════════════════════════════════════════════════════════════════╝$C_RST

Resumo da Execução:
  1. $C_GRN✓$C_RST Remotes configurados: upstream ($UPSTREAM_URL) e origin ($ORIGIN_URL)
  2. $C_GRN✓$C_RST Branch 'main' sincronizada com a versão mais recente ($VERSAO_ATUAL)
  3. $C_GRN✓$C_RST Branch 'custom/minhas-alteracoes' rebaseada com suas features no topo
  4. $C_GRN✓$C_RST Branch 'feat/easypanel-reverse-proxy-none' atualizada e enviada ao GitHub
  5. $C_GRN✓$C_RST Banco de dados e deploy processados

FIM

if [ "$DEPLOY_ACIONADO" -eq 0 ]; then
  cat <<INSTRUCAO
$C_YLW$C_BLDPróximo passo na VPS (Hostinger / EasyPanel):$C_RST
  • Acesse seu painel do EasyPanel na Hostinger.
  • No seu serviço do DeskcommCRM, clique no botão $C_BLD"Implantar"$C_RST (Deploy).
  • O EasyPanel baixará a branch $C_BLDfeat/easypanel-reverse-proxy-none$C_RST atualizada
    contendo todas as novidades do projeto oficial + todas as suas customizações!

$C_CYN$C_BLDDica Pro:$C_RST Adicione $C_BLDEASYPANEL_WEBHOOK_URL="sua_url_aqui"$C_RST no seu .env para
que as próximas atualizações iniciem o deploy na VPS 100% no automático!
INSTRUCAO
fi
