"use server";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "node:crypto";
import { audit } from "@/lib/audit";

interface ImportLeadPayload {
  title: string;
  phone: string;
  custom_fields?: any;
}

interface ImportInput {
  pipelineId: string;
  stageId: string;
  leads: ImportLeadPayload[];
}

export async function importLeadsAction(input: ImportInput) {
  try {
    const user = await requireAuth();
    const activeOrg = await resolveActiveOrg(user);
    if (!activeOrg) throw new Error("Organização não encontrada");

    const supabase = await createClient();
    
    // Batch Insert Contacts and Leads
    let importedCount = 0;

    for (const lead of input.leads) {
      if (!lead.phone) continue;

      // 1. Procurar ou Criar Contato
      let contactId: string | null = null;
      
      // Sanitizar telefone
      const safePhone = lead.phone.replace(/\D/g, "");

      const { data: existingContact, error: fetchErr } = await supabase
        .from("contacts")
        .select("id")
        .eq("organization_id", activeOrg.orgId)
        .eq("phone_number", safePhone)
        .maybeSingle();

      if (existingContact) {
        contactId = existingContact.id;
      } else {
        const cId = randomUUID();
        const { error: cErr } = await supabase
          .from("contacts")
          .insert({
            id: cId,
            organization_id: activeOrg.orgId,
            name: lead.title,
            phone_number: safePhone,
            source: "import",
            source_metadata: lead.custom_fields
          });
        
        if (!cErr) {
          contactId = cId;
        } else {
          console.error("Erro ao criar contato:", cErr);
        }
      }

      if (!contactId) continue;

      // 2. Criar Lead
      const leadId = randomUUID();
      const { error: lErr } = await supabase
        .from("crm_leads")
        .insert({
          id: leadId,
          organization_id: activeOrg.orgId,
          pipeline_id: input.pipelineId,
          stage_id: input.stageId,
          title: lead.title,
          contact_id: contactId,
          source: "import",
          owner_user_id: user.id
        });

      if (!lErr) {
        importedCount++;
        
        // 3. (Opcional) Enroll the lead on AI fallback if we had the agent IDs
        // Aqui apenas inserimos. O script batch de cron ("disparo-em-lote.ts") ou o sistema 
        // de Inbox pegará este Lead pois está no stage 'Novo'.
      } else {
        console.error("Erro ao criar lead:", lErr);
      }
    }

    await audit({
      action: "lead.bulk_action",
      actorUserId: user.id,
      organizationId: activeOrg.orgId,
      resourceType: "crm_pipeline",
      resourceId: input.pipelineId,
      requestId: `import-${Date.now()}`,
      metadata: { count: importedCount, stage: input.stageId }
    });

    return { ok: true, importedCount };
  } catch (error: any) {
    console.error("Import error", error);
    return { ok: false, error: error.message };
  }
}
