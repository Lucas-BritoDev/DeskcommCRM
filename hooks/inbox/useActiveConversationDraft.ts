"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { LeituraDoRascunho } from "@/lib/inbox/rascunho-sugerido";

/**
 * Consulta o último rascunho ativo não consumido da conversa (Issue #1611).
 * Recarrega a cada 10s para capturar orçamentos gerados em background pelo motor.
 */
export function useActiveConversationDraft(conversationId: string | null) {
  return useQuery({
    queryKey: ["conversation_draft", conversationId],
    enabled: !!conversationId,
    retry: false,
    refetchInterval: 10_000,
    queryFn: () =>
      apiClient
        .get<{ data: { draft: LeituraDoRascunho | null } }>(
          `/api/v1/conversations/${conversationId}/drafts`,
        )
        .then((r) => r.data.draft),
  });
}
