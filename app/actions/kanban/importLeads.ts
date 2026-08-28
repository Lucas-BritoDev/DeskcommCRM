"use server";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

/**
 * Server Action para importar leads a partir de planilha.
 *
 * Usa admin client (service role) pois o insert de contacts+leads
 * precisa passar pelo RLS sem depender de policies de escrita do
 * papel do usuário. O organization_id é resolvido da sessão
 * autenticada (fonte confiável), nunca do payload.
 */
export async function importLeadsAction(input: ImportInput) {
  const errors: string[] = [];

  try {
    const user = await requireAuth();
    const activeOrg = await resolveActiveOrg(user);
    if (!activeOrg) return { ok: false, error: "Organização não encontrada", importedCount: 0 };

    const admin = createAdminClient();

    let importedCount = 0;

    for (const lead of input.leads) {
      if (!lead.phone) {
        errors.push(`Lead "${lead.title}" ignorado — sem telefone.`);
        continue;
      }

      // Sanitizar telefone: apenas dígitos
      const safePhone = lead.phone.replace(/\D/g, "");
      if (safePhone.length < 10) {
        errors.push(`Lead "${lead.title}" ignorado — telefone "${lead.phone}" muito curto.`);
        continue;
      }

      // 1. Procurar ou Criar Contato
      let contactId: string | null = null;

      const { data: existingContact, error: fetchErr } = await admin
        .from("contacts")
        .select("id")
        .eq("organization_id", activeOrg.orgId)
        .eq("phone_number", safePhone)
        .maybeSingle();

      if (fetchErr) {
        errors.push(`Erro ao buscar contato "${lead.title}": ${fetchErr.message}`);
        continue;
      }

      if (existingContact) {
        contactId = existingContact.id;
      } else {
        const cId = randomUUID();
        const { error: cErr } = await admin
          .from("contacts")
          .insert({
            id: cId,
            organization_id: activeOrg.orgId,
            name: lead.title,
            phone_number: safePhone,
            source: "import",
          });

        if (cErr) {
          errors.push(`Erro ao criar contato "${lead.title}": ${cErr.message}`);
          continue;
        }
        contactId = cId;
      }

      // 2. Checar se já existe lead para este contato neste pipeline
      const { data: existingLead } = await admin
        .from("crm_leads")
        .select("id")
        .eq("organization_id", activeOrg.orgId)
        .eq("pipeline_id", input.pipelineId)
        .eq("contact_id", contactId)
        .maybeSingle();

      if (existingLead) {
        errors.push(`Lead "${lead.title}" já existe neste funil (contato duplicado).`);
        continue;
      }

      // 3. Criar Lead
      const leadId = randomUUID();
      const { error: lErr } = await admin
        .from("crm_leads")
        .insert({
          id: leadId,
          organization_id: activeOrg.orgId,
          pipeline_id: input.pipelineId,
          stage_id: input.stageId,
          title: lead.title,
          contact_id: contactId,
          source: "import",
          created_by_user_id: user.id,
        });

      if (lErr) {
        errors.push(`Erro ao criar lead "${lead.title}": ${lErr.message}`);
        continue;
      }

      importedCount++;
    }

    await audit({
      action: "lead.bulk_action",
      actorUserId: user.id,
      organizationId: activeOrg.orgId,
      resourceType: "crm_pipeline",
      resourceId: input.pipelineId,
      requestId: `import-${Date.now()}`,
      metadata: { count: importedCount, stage: input.stageId, errors: errors.length },
    });

    if (importedCount === 0 && errors.length > 0) {
      return { ok: false, error: errors.join(" | "), importedCount: 0 };
    }

    return {
      ok: true,
      importedCount,
      warnings: errors.length > 0 ? errors : undefined,
    };
  } catch (error: any) {
    return { ok: false, error: error.message || "Erro desconhecido", importedCount: 0 };
  }
}
