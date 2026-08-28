import { createAdminClient } from "../lib/supabase/admin";
import { audit } from "../lib/audit";

const ORG_ID = "10321a07-df53-411e-a255-f821be4c3ca4";
const STAGE_NOVO_ID = "91fa660d-70bc-45fd-a162-7c32b25239b1";
const POINTER_ID = "2dc4e8c1-962b-41a7-b490-daa51121a892";
const VERSION_ID = "bed4f192-f8f3-496b-abaf-14f2c4b94e54";
const AGENT_ID = "237a47f4-760a-42f9-8369-68720037fcca";

// Altere este valor para disparar para todos os leads restantes
const LIMIT = 10; 

async function run() {
  console.log(`Iniciando script de disparo em lote (Limite: ${LIMIT} leads)...`);
  const admin = createAdminClient();

  // 1. Buscar os leads na etapa "Novo"
  console.log("Buscando leads na etapa 'Novo'...");
  const { data: leads, error: leadErr } = await admin
    .from("crm_leads")
    .select("id, contact_id, owner_agent_id, owner_kind")
    .eq("organization_id", ORG_ID)
    .eq("stage_id", STAGE_NOVO_ID)
    .order("created_at", { ascending: false });

  if (leadErr || !leads) {
    console.error("Erro ao buscar leads:", leadErr);
    process.exit(1);
  }

  console.log(`Encontrados ${leads.length} leads na etapa Novo.`);

  // 2. Filtrar leads que não estão no follow-up
  const enrolmentsCriados = [];
  let processados = 0;

  for (const lead of leads) {
    if (processados >= LIMIT) break;

    // Checar se já tem enrollment
    const { data: existing } = await admin
      .from("followup_enrollments")
      .select("id")
      .eq("organization_id", ORG_ID)
      .eq("contact_id", lead.contact_id)
      .maybeSingle();

    if (existing) {
      continue; // Já está em um follow-up
    }

    // 3. Atribuir a Luiza como dona do Lead (para ela ter contexto total e responder)
    if (lead.owner_agent_id !== AGENT_ID) {
      await admin
        .from("crm_leads")
        .update({ owner_kind: "agent", owner_agent_id: AGENT_ID })
        .eq("id", lead.id);
    }

    // 4. Inserir o enrollment no fluxo da Luiza
    const now = new Date().toISOString();
    const { data: created, error: insErr } = await admin
      .from("followup_enrollments")
      .insert({
        organization_id: ORG_ID,
        pointer_id: POINTER_ID,
        version_id: VERSION_ID,
        contact_id: lead.contact_id,
        current_node_id: "t", // Node de Trigger
        status: "active",
        next_eval_at: now,
        agent_id: AGENT_ID,
      })
      .select("id")
      .single();

    if (insErr) {
      console.error(`Erro ao enrolar contato ${lead.contact_id}:`, insErr.message);
      continue;
    }

    // 5. Log de auditoria
    await audit({
      action: "followup_enrollment.created",
      actorUserId: "00000000-0000-0000-0000-000000000000", // system
      organizationId: ORG_ID,
      resourceType: "followup_enrollment",
      resourceId: created.id,
      requestId: `batch-${Date.now()}`,
      metadata: { pointer_id: POINTER_ID, contact_id: lead.contact_id, version_id: VERSION_ID, agent_id: AGENT_ID, origin: "batch_script" },
    });

    console.log(`✅ Lead ${lead.id} enrolado com sucesso (Contato: ${lead.contact_id}).`);
    enrolmentsCriados.push(created.id);
    processados++;
  }

  console.log(`\n🎉 Disparo concluído! ${enrolmentsCriados.length} novos leads inseridos no fluxo.`);
  console.log(`Eles receberão as mensagens nas próximas horas de acordo com o limite diário e janela de horário (8h-20h).`);
}

run().catch(console.error);
