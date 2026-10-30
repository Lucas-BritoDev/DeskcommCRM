-- =====================================================================
-- INTEGRACAO LOJAO DOS MARMORES COM DESKCOMM CRM
-- Conecta o DeskcommCRM da VPS diretamente ao Supabase Nuvem do Lojao
-- Executar no container supabase-db da VPS
-- =====================================================================

BEGIN;

-- 1. Habilita pg_net para chamadas assincronas do banco
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Gatilho no CRM: sempre que entrar ou atualizar contato, envia pro Lojao (Nuvem)
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

  -- Sanitiza o nome removendo caracteres decorativos
  IF v_nome IS NOT NULL THEN
    v_nome := regexp_replace(v_nome, '<[^>]*>', '', 'g');
    v_nome := regexp_replace(v_nome, '[^a-zA-Z0-9áàâãéèêíïóôõöúçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ\s\.\,\-\/\''\&]', '', 'g');
    v_nome := regexp_replace(v_nome, '\s+', ' ', 'g');
    v_nome := regexp_replace(v_nome, '^[\.\,\-\/\''\&\s]+|[\.\,\-\/\''\&\s]+$', '', 'g');
    v_nome := nullif(btrim(v_nome), '');
  END IF;

  IF v_telefone IS NULL AND v_nome IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF coalesce(OLD.name, '') = coalesce(NEW.name, '')
       AND coalesce(OLD.display_name, '') = coalesce(NEW.display_name, '')
       AND coalesce(OLD.phone_number, '') = coalesce(NEW.phone_number, '')
       AND coalesce(OLD.email, '') = coalesce(NEW.email, '') THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Dispara chamada assincrona para o Lojao (Supabase Nuvem)
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


-- 3. Gatilho no CRM: sempre que criar ou mover lead com medidas, cria o orcamento no Lojao
CREATE OR REPLACE FUNCTION public.fn_sync_lead_orcamento_to_lojao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_contact RECORD;
  v_lead_payload jsonb;
  v_tem_medidas boolean := false;
BEGIN
  -- Apenas para a organizacao LBODEVAPPS (Lojao dos Marmores)
  IF NEW.organization_id <> '977fbdf5-6349-4a26-be99-a359618f9f33' THEN
    RETURN NEW;
  END IF;

  -- Verifica se ha dados suficientes para orcar
  IF (NEW.custom_fields ? 'medidas') OR 
     (NEW.title ~* '(\d+[\.,]?\d*)\s*(x|por|\*)\s*(\d+[\.,]?\d*)') OR
     (NEW.description ~* '(\d+[\.,]?\d*)\s*(x|por|\*)\s*(\d+[\.,]?\d*)') OR
     ('orcamento' = ANY(NEW.tags)) OR
     (NEW.stage_id = 'a4473273-778c-4327-b359-e86201a7e878') THEN
    v_tem_medidas := true;
  END IF;

  IF NOT v_tem_medidas THEN
    RETURN NEW;
  END IF;

  -- Se for UPDATE e nada relevante mudou, nao reenvia
  IF TG_OP = 'UPDATE' THEN
    IF coalesce(OLD.title, '') = coalesce(NEW.title, '')
       AND coalesce(OLD.description, '') = coalesce(NEW.description, '')
       AND coalesce(OLD.custom_fields, '{}'::jsonb) = coalesce(NEW.custom_fields, '{}'::jsonb)
       AND coalesce(OLD.stage_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(NEW.stage_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Busca dados do contato (nome e telefone)
  IF NEW.contact_id IS NOT NULL THEN
    SELECT name, display_name, address_book_name, phone_number, email
      INTO v_contact
      FROM public.contacts
     WHERE id = NEW.contact_id;
  END IF;

  -- Monta envelope
  v_lead_payload := jsonb_build_object(
    'lead', jsonb_build_object(
      'id', NEW.id,
      'title', NEW.title,
      'description', NEW.description,
      'organization_id', NEW.organization_id,
      'stage_id', NEW.stage_id,
      'contact_id', NEW.contact_id,
      'tags', to_jsonb(NEW.tags),
      'custom_fields', NEW.custom_fields,
      'contato_nome', coalesce(v_contact.name, v_contact.display_name, v_contact.address_book_name, NEW.title),
      'contato_telefone', v_contact.phone_number
    ),
    'organization_id', NEW.organization_id
  );

  -- Envia para a Edge Function lojao-orcamento no Supabase da Nuvem
  BEGIN
    PERFORM net.http_post(
      url := 'https://knypuvtjodjazxdizguz.supabase.co/functions/v1/lojao-orcamento/crm/orcamento?modo=producao',
      body := v_lead_payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', '3cfc7ddcf0d909e9b4eb774a8dd7ca38f76e92ae8b5c1f9aa8c816baa3975fca',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtueXB1dnRqb2RqYXp4ZGl6Z3V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0NzUyOTMsImV4cCI6MjA2NzA1MTI5M30.2C99hJlWZW47DEwhJHPd-xyx9hLGjz_Edl3TUfQ4xz0',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtueXB1dnRqb2RqYXp4ZGl6Z3V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0NzUyOTMsImV4cCI6MjA2NzA1MTI5M30.2C99hJlWZW47DEwhJHPd-xyx9hLGjz_Edl3TUfQ4xz0'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha ao sincronizar lead/orcamento com o Lojao: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_leads_sync_lojao_orcamento ON public.crm_leads;
CREATE TRIGGER trg_leads_sync_lojao_orcamento
AFTER INSERT OR UPDATE ON public.crm_leads
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_lead_orcamento_to_lojao();


-- 4. Garante que conversas nao fiquem presas em silencio
UPDATE public.conversations 
   SET bot_silenced_until = NULL 
 WHERE organization_id = '977fbdf5-6349-4a26-be99-a359618f9f33'
   AND (bot_silenced_until IS NOT NULL);

COMMIT;

-- Validacao
SELECT 'contacts_trigger' as item, count(*) FROM pg_trigger WHERE tgname = 'trg_contacts_sync_lojao'
UNION ALL
SELECT 'leads_trigger', count(*) FROM pg_trigger WHERE tgname = 'trg_leads_sync_lojao_orcamento';
