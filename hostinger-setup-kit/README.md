# 🚀 Hostinger & EasyPanel Setup Kit — DeskcommCRM

Kit de automação para gerenciar, sincronizar e implantar atualizações do **DeskcommCRM** mantendo as suas customizações intactas em uma VPS Hostinger utilizando o painel **EasyPanel**.

---

## 🎯 O que o `hostinger-setup-kit/update.sh` faz?

O script executa de ponta a ponta o ciclo completo dos 5 passos necessários:

1. **Passo 1 — Padronização dos Remotes Git:**
   - Detecta e ajusta os remotes automaticamente:
     - `upstream`: Repositório oficial (`https://github.com/melgarafael/DeskcommCRM.git`)
     - `origin`: Seu repositório pessoal / fork (`https://github.com/Lucas-BritoDev/DeskcommCRM.git`)
   - Corrige automaticamente caso os nomes estejam invertidos.

2. **Passo 2 — Atualização da Branch `main`:**
   - Mantém a branch `main` 100% limpa como espelho do projeto original.
   - Puxa tags e novas versões oficiais (como a `v1.17.0`).
   - Envia a `main` atualizada para o seu GitHub.

3. **Passo 3 — Mesclagem com suas Customizações:**
   - Cria um backup preventivo automático da sua branch de trabalho.
   - Faz o `rebase` dos seus commits personalizados (`custom/minhas-alteracoes`) no topo da versão mais recente do upstream.
   - Envia a branch com suas alterações para o seu GitHub (`origin/custom/minhas-alteracoes`).

4. **Passo 4 — Atualização da Branch de Deploy (`feat/easypanel-reverse-proxy-none`):**
   - Atualiza a branch lida pelo EasyPanel na Hostinger.
   - Garante a presença dos arquivos de configuração `docker-compose.easypanel.yml` e `docker-compose.no-proxy.yml`.
   - Envia a branch de deploy atualizada para o seu GitHub.

5. **Passo 5 — Banco de Dados e Deploy:**
   - Conecta ao Postgres/Supabase via `SUPABASE_DB_ADMIN_URL` ou `DATABASE_URL` (se informado no `.env` ou se rodando na VPS).
   - Aplica extensões (`vector`, `citext`, `pg_trgm`) e o `supabase/baseline.sql` de forma segura e idempotente.
   - Se configurado `EASYPANEL_WEBHOOK_URL` no `.env`, dispara o deploy na VPS automaticamente via webhook sem você precisar abrir o navegador!
   - Se executado diretamente na VPS, recria os contêineres Docker.

---

## 💻 Como Usar

No terminal (Git Bash no Windows ou terminal da VPS):

```bash
bash hostinger-setup-kit/update.sh
```

### Opções Disponíveis:

- **Pular banco de dados (apenas sincronizar código e enviar ao GitHub):**
  ```bash
  bash hostinger-setup-kit/update.sh --skip-db
  ```

- **Testar localmente sem dar push no GitHub:**
  ```bash
  bash hostinger-setup-kit/update.sh --skip-push
  ```

- **Disparar um webhook específico do EasyPanel:**
  ```bash
  bash hostinger-setup-kit/update.sh --webhook "https://seu-painel.com/api/deploy-webhook/..."
  ```

---

## ⚡ Automatização com Webhook do EasyPanel (Recomendado)

No painel do EasyPanel:
1. Abra o serviço do seu CRM.
2. Na aba **Deploy / Implantação**, localize a opção **Webhook URL**.
3. Copie a URL e cole no seu arquivo `.env`:
   ```env
   EASYPANEL_WEBHOOK_URL="https://seu-easypanel.hostinger.com/api/deploy?token=..."
   ```

A partir desse momento, toda vez que você rodar `bash hostinger-setup-kit/update.sh`, ele vai:
1. Puxar o código novo do Rafael Melgaço
2. Colocar suas customizações em cima
3. Atualizar a branch do EasyPanel no GitHub
4. Aplicar o banco de dados
5. Acionar o EasyPanel para reiniciar a aplicação na VPS

Tudo com **um único comando**.
