# 🚀 Hostinger & EasyPanel Setup Kit — DeskcommCRM

Kit de automação e utilitários operacionais para gerenciar, sincronizar, fazer backup e implantar atualizações do **DeskcommCRM** mantendo as suas customizações intactas em uma VPS Hostinger utilizando o painel **EasyPanel**.

---

## 📁 Utilitários Disponíveis

| Script | O que ele faz |
| :--- | :--- |
| **`update.sh`** | Ciclo completo: sincroniza com o repositório oficial, rebaseia suas customizações, atualiza a branch de deploy do EasyPanel, aplica o banco (`baseline.sql`) e aciona o deploy. |
| **`agent.sh`** | Agente de atualização em segundo plano que roda no `cron` da VPS. Ele descobre novas versões do upstream e faz aparecer o botão de "Nova versão" na barra lateral do CRM! |
| **`backup.sh`** | Gera dump compactado do banco PostgreSQL (`.sql.gz`) + arquivo das sessões ativas do WhatsApp WAHA (`.tgz`), mantendo os últimos 14 backups. |
| **`restore.sh`** | Restaura o banco de dados a partir de um arquivo de backup previamente gerado. |
| **`reset-password.sh`** | Redefine a senha de um usuário ou administrador caso você seja trancado para fora do CRM. |
| **`reset-mfa.sh`** | Remove os fatores de duplo fator de autenticação (MFA / 2FA) caso você perca o app autenticador no celular. |

---

## 1. 🔄 Como Atualizar o CRM (`update.sh`)

No terminal (Git Bash no Windows ou terminal SSH da VPS):

```bash
bash hostinger-setup-kit/update.sh
```

### Opções úteis:
- **Passar a connection string do banco manualmente:**
  ```bash
  bash hostinger-setup-kit/update.sh --db-url "postgresql://postgres:senha@host:5432/postgres"
  ```
- **Apenas sincronizar o código sem tocar no banco:**
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

## 2. 💾 Como Fazer Backup (`backup.sh`)

Para criar um backup completo do banco e do WhatsApp antes de qualquer manutenção:

```bash
bash hostinger-setup-kit/backup.sh
```

Ou especificando o banco diretamente:
```bash
bash hostinger-setup-kit/backup.sh --db-url "postgresql://postgres:senha@host:5432/postgres"
```

Os backups são salvos compactados na pasta `backups/`:
- `backups/db-YYYYMMDD-HHMMSS.sql.gz`
- `backups/waha-YYYYMMDD-HHMMSS.tgz`

---

## 3. ⏪ Como Restaurar um Backup (`restore.sh`)

Para restaurar um backup específico gerado anteriormente:

```bash
bash hostinger-setup-kit/restore.sh backups/db-20260908-120000.sql.gz
```

O script pede uma confirmação de segurança digitando `RESTAURAR` antes de aplicar.

---

## 4. 🔑 Redefinição de Senha de Emergência (`reset-password.sh`)

Se você ou um operador esquecer a senha e não tiver servidor de e-mail SMTP configurado:

```bash
bash hostinger-setup-kit/reset-password.sh usuario@empresa.com
```

O terminal solicitará a nova senha de forma oculta e a atualizará de forma segura no Supabase.

---

## 5. 🛡️ Remover Bloqueio de 2FA / MFA (`reset-mfa.sh`)

Se um usuário perder o celular ou desinstalar o Google Authenticator e ficar travado no MFA:

```bash
bash hostinger-setup-kit/reset-mfa.sh usuario@empresa.com
```

Isso limpa os fatores cadastrados no banco para este usuário. No próximo login com senha, o usuário conseguirá entrar e cadastrar um novo autenticador normalmente.

---

## ⚡ Automatização com Webhook do EasyPanel (Recomendado)

No painel do EasyPanel:
1. Abra o serviço do seu CRM.
2. Na aba **Deploy / Implantação**, localize a opção **Webhook URL**.
3. Copie a URL e adicione no seu arquivo `.env`:
   ```env
   EASYPANEL_WEBHOOK_URL="https://seu-easypanel.hostinger.com/api/deploy?token=..."
   ```

A partir desse momento, toda vez que você rodar `bash hostinger-setup-kit/update.sh`, ele cuidará de:
1. Puxar o código novo oficial do Rafael Melgaço
2. Colocar as suas customizações no topo
3. Atualizar a branch do EasyPanel no GitHub
4. Aplicar o banco de dados
5. Disparar a implantação na VPS de forma 100% automática!

---

## 6. 🔔 Como Habilitar o Botão "Nova Versão" na Sidebar do CRM

No CRM oficial, o rodapé da barra lateral esquerda mostra a versão instalada. Quando surge uma versão nova, ele acende um aviso pulsante **"Nova versão · 1.17.x"** que permite ao dono atualizar com um único clique.

### Como funciona essa engrenagem:
1. **Segurança:** O contêiner web não tem acesso root ao servidor. Quem faz a ponte é o script `hostinger-setup-kit/agent.sh`.
2. **Heartbeat:** O `agent.sh` roda a cada 5 minutos no Linux da VPS via `crontab`. Ele verifica se o Rafael Melgaço lançou novas tags, envia esse status para o CRM e pergunta se alguém clicou no botão de atualizar.
3. **Clique do Dono:** Quando você clica em "Atualizar agora" na tela de Configurações › Atualização, a VPS é notificada no próximo ciclo do agente e executa a atualização preservando as suas customizações.

### Como ativar na sua VPS Hostinger:
1. Conecte na sua VPS via SSH:
   ```bash
   ssh root@seu-ip-da-hostinger
   ```
2. Abra o agendador de tarefas do Linux:
   ```bash
   crontab -e
   ```
3. Adicione a linha abaixo no final do arquivo (substituindo pelo caminho onde o CRM está clonado):
   ```cron
   */5 * * * * cd /caminho/do/DeskcommCRM && bash hostinger-setup-kit/agent.sh >/dev/null 2>&1
   ```
4. Salve e saia (no nano: `Ctrl + O`, `Enter`, `Ctrl + X`).

Pronto! A partir desse momento, sempre que o repositório oficial lançar uma atualização, o seu CRM detectará automaticamente e exibirá o botão na barra lateral para você atualizar direto pela interface web!
