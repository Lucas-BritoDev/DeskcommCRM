-- =====================================================================
-- INTEGRACAO LOJAO DOS MARMORES (OPCAO 1: VERCEL + SUPABASE NUVEM)
-- Conecta o DeskcommCRM da VPS diretamente ao painel da Vercel
-- =====================================================================

BEGIN;

-- 1. Habilita pg_net para chamadas assincronas do banco
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Cadastra o token de API MCP na VPS para o motor do Lojao conseguir criar rascunhos no CRM
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Obtem um usuario admin da organizacao para atribuir o token
  SELECT user_id INTO v_user_id FROM public.user_roles 
   WHERE organization_id = '977fbdf5-6349-4a26-be99-a359618f9f33' 
   ORDER BY created_at ASC LIMIT 1;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;
  END IF;

  INSERT INTO public.api_tokens (
    id,
    organization_id,
    created_by,
    name,
    prefix,
    token_hash,
    scopes,
    created_at,
    updated_at
  ) VALUES (
    '7605dd52-c155-4ab7-bc04-00ac131e6c2e',
    '977fbdf5-6349-4a26-be99-a359618f9f33',
    coalesce(v_user_id, 'c7616783-35cf-4aef-9646-67eda208bd89'),
    'Lojao: motor cria rascunho no CRM',
    'dsk_lojao_rasc_09bm78vf9',
    '\x3f3446c16a09f395d7e45aa136a9b41cf920b78e3725ada2d218bbc185be7ad6'::bytea,
    '["role:admin", "mcp:read", "mcp:write"]'::jsonb,
    now(),
    now()
  ) ON CONFLICT (id) DO UPDATE SET
    revoked_at = NULL,
    scopes = '["role:admin", "mcp:read", "mcp:write"]'::jsonb,
    updated_at = now();
END $$;

-- 3. Gatilho no CRM: sempre que entrar ou atualizar contato, envia pro Lojao (Nuvem / Vercel)
CREATE OR REPLACE FUNCTION public.fn_sync_contact_to_lojao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_nome text;
  v_telefone text;
  v_email text;
BEGIN
  -- Apenas para a organizacao LBODEVAPPS (Lojao dos Marmores)
  IF NEW.organization_id <> '977fbdf5-6349-4a26-be99-a359618f9f33' THEN
    RETURN NEW;
  END IF;

  v_nome := coalesce(nullif(btrim(NEW.name), ''), nullif(btrim(NEW.display_name), ''), nullif(btrim(NEW.address_book_name), ''));
  v_telefone := nullif(btrim(NEW.phone_number), '');
  v_email := nullif(btrim(NEW.email), '');

  -- Sanitiza o nome removendo emojis, caracteres decorativos e simbolos
  IF v_nome IS NOT NULL THEN
    v_nome := regexp_replace(v_nome, '<[^>]*>', '', 'g');
    v_nome := regexp_replace(v_nome, '[^a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s\.\,\-\/\''\&]', '', 'g');
    v_nome := regexp_replace(v_nome, '\s+', ' ', 'g');
    v_nome := regexp_replace(v_nome, '^[\.\,\-\/\''\&\s]+|[\.\,\-\/\''\&\s]+$', '', 'g');
    v_nome := nullif(btrim(v_nome), '');
  END IF;

  -- Se nao tem nem nome nem telefone, nao precisa enviar
  IF v_telefone IS NULL AND v_nome IS NULL THEN
    RETURN NEW;
  END IF;

  -- Se for UPDATE, so envia se realmente houve mudanca nos dados de identificacao
  IF TG_OP = 'UPDATE' THEN
    IF coalesce(OLD.name, '') = coalesce(NEW.name, '')
       AND coalesce(OLD.display_name, '') = coalesce(NEW.display_name, '')
       AND coalesce(OLD.phone_number, '') = coalesce(NEW.phone_number, '')
       AND coalesce(OLD.email, '') = coalesce(NEW.email, '') THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Dispara chamada assincrona para o Lojao (Supabase Nuvem da Vercel)
  BEGIN
    PERFORM net.http_post(
      url := 'https://knypuvtjodjazxdizguz.supabase.co/rest/v1/rpc/fn_lojao_sincronizar_contato',
      body := jsonb_build_object(
        'p_nome', v_nome,
        'p_telefone', v_telefone,
        'p_email', v_email,
        'p_origem', 'deskcrm_whatsapp'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtueXB1dnRqb2RqYXp4ZGl6Z3V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0NzUyOTMsImV4cCI6MjA2NzA1MTI5M30.2C99hJlWZW47DEwhJHPd-xyx9hLGjz_Edl3TUfQ4xz0',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtueXB1dnRqb2RqYXp4ZGl6Z3V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0NzUyOTMsImV4cCI6MjA2NzA1MTI5M30.2C99hJlWZW47DEwhJHPd-xyx9hLGjz_Edl3TUfQ4xz0'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha ao sincronizar contato com o Lojao: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_contacts_sync_lojao ON public.contacts;
CREATE TRIGGER trg_contacts_sync_lojao
AFTER INSERT OR UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_contact_to_lojao();

-- 4. Regras de automacao para calculo de orcamento no motor do Lojao
DO $$
DECLARE
  v_secret text := '3cfc7ddcf0d909e9b4eb774a8dd7ca38f76e92ae8b5c1f9aa8c816baa3975fca';
  v_enc text;
  v_actions1 jsonb;
  v_actions2 jsonb;
BEGIN
  -- Tenta cifrar com a GUC do banco local
  BEGIN
    SELECT public.fn_encrypt_oauth(v_secret) INTO v_enc;
  EXCEPTION WHEN OTHERS THEN
    v_enc := NULL;
  END;

  IF v_enc IS NOT NULL THEN
    v_enc := regexp_replace(v_enc, '^\\x', '');
  ELSE
    -- Chave original cifrada de fallback
    v_enc := 'c30d0409030252a6c47a5af9d10279d2710187779faeb557aaf4a0c4f4f430e6616e6d39eeaa1f30eb8164f97b7c91f5741559b16281f90da2b2bbef1fe124246a6703e4a95745b138b5af21a2cd0e36026303319831038cdd6342003c661bfaddc80830f677f82f4b68e08331e572f13d2a37c82f2e73787cb242a27c27ee33c6a1';
  END IF;

  v_actions1 := jsonb_build_array(
    jsonb_build_object(
      'type', 'call_webhook',
      'config', jsonb_build_object(
        'url', 'https://knypuvtjodjazxdizguz.supabase.co/functions/v1/lojao-orcamento/crm/orcamento?modo=producao',
        'secret_enc', v_enc
      )
    ),
    jsonb_build_object(
      'type', 'call_webhook',
      'config', jsonb_build_object(
        'url', 'https://knypuvtjodjazxdizguz.supabase.co/functions/v1/lojao-rascunho',
        'secret_enc', v_enc
      )
    )
  );

  v_actions2 := jsonb_build_array(
    jsonb_build_object(
      'type', 'call_webhook',
      'config', jsonb_build_object(
        'url', 'https://knypuvtjodjazxdizguz.supabase.co/functions/v1/lojao-orcamento/crm/orcamento?modo=producao',
        'secret_enc', v_enc
      )
    )
  );

  INSERT INTO public.automation_rules (
    id, organization_id, name, trigger_event, conditions, actions, is_active, created_at, updated_at
  ) VALUES (
    '627ae1f5-cf55-4809-848d-833429f86b45',
    '977fbdf5-6349-4a26-be99-a359618f9f33',
    'Lojao: calcular orcamento no motor',
    'lead.stage_changed',
    '[{"op":"contains","field":"lead.tags","value":"orcamento"},{"op":"eq","field":"lead.stage_id","value":"a4473273-778c-4327-b359-e86201a7e878"}]'::jsonb,
    v_actions1,
    true, now(), now()
  ) ON CONFLICT (id) DO UPDATE SET
    is_active = true,
    conditions = EXCLUDED.conditions,
    actions = v_actions1,
    updated_at = now();

  INSERT INTO public.automation_rules (
    id, organization_id, name, trigger_event, conditions, actions, is_active, created_at, updated_at
  ) VALUES (
    '5d0e68e3-2761-4bd8-b8f3-54f4ea3bf7a8',
    '977fbdf5-6349-4a26-be99-a359618f9f33',
    'Lojao: recalcular orcamento quando a medida muda',
    'lead.updated',
    '[{"op":"contains","field":"lead.tags","value":"orcamento"},{"op":"eq","field":"lead.stage_id","value":"a4473273-778c-4327-b359-e86201a7e878"}]'::jsonb,
    v_actions2,
    true, now(), now()
  ) ON CONFLICT (id) DO UPDATE SET
    is_active = true,
    conditions = EXCLUDED.conditions,
    actions = v_actions2,
    updated_at = now();
END $$;

-- 5. Sincroniza retroativamente todos os contatos que ja estao no CRM para o Lojao
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT name, display_name, address_book_name, phone_number, email 
      FROM public.contacts 
     WHERE organization_id = '977fbdf5-6349-4a26-be99-a359618f9f33'
       AND (phone_number IS NOT NULL OR name IS NOT NULL)
  ) LOOP
    PERFORM net.http_post(
      url := 'https://knypuvtjodjazxdizguz.supabase.co/rest/v1/rpc/fn_lojao_sincronizar_contato',
      body := jsonb_build_object(
        'p_nome', coalesce(r.name, r.display_name, r.address_book_name),
        'p_telefone', r.phone_number,
        'p_email', r.email,
        'p_origem', 'deskcrm_retroativo'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtueXB1dnRqb2RqYXp4ZGl6Z3V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0NzUyOTMsImV4cCI6MjA2NzA1MTI5M30.2C99hJlWZW47DEwhJHPd-xyx9hLGjz_Edl3TUfQ4xz0',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtueXB1dnRqb2RqYXp4ZGl6Z3V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0NzUyOTMsImV4cCI6MjA2NzA1MTI5M30.2C99hJlWZW47DEwhJHPd-xyx9hLGjz_Edl3TUfQ4xz0'
      )
    );
  END LOOP;
END $$;

-- 6. Destrava o contato Luck e qualquer conversa silenciada para responder imediatamente
UPDATE public.contacts 
   SET force_human = false, ai_opt_out = false 
 WHERE phone_number LIKE '%999203609%'
    OR organization_id = '977fbdf5-6349-4a26-be99-a359618f9f33' AND name ILIKE '%Luck%';

UPDATE public.conversations 
   SET bot_silenced_until = NULL 
 WHERE organization_id = '977fbdf5-6349-4a26-be99-a359618f9f33'
   AND (bot_silenced_until IS NOT NULL);

COMMIT;

-- Verificacao
SELECT 'api_tokens' as item, count(*) FROM public.api_tokens WHERE name LIKE '%Lojao%'
UNION ALL
SELECT 'automation_rules', count(*) FROM public.automation_rules WHERE name LIKE '%Lojao%'
UNION ALL
SELECT 'contacts_ativos', count(*) FROM public.contacts WHERE force_human = false;
