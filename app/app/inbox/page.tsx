import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { InboxLayout } from "@/components/inbox/InboxLayout";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";
import {
  lerRascunho,
  lerUltimoRascunhoAtivo,
  type AvisoDeRascunho,
} from "@/lib/inbox/rascunho-sugerido";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; rascunho?: string }>;
}) {
  const user = await loadAuthUser();
  if (!user) redirect("/login");
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) {
    const idioma = user.idioma;
    // As duas saídas que a frase anterior oferecia — "aceite um convite" e
    // "contate o admin" — não existem para quem INSTALOU o sistema: não há
    // convite e o admin é ele. Este é o estado terminal do primeiro acesso que
    // falhou, e o link é a única porta para fora dele.
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
        <p>
          {traduzir(
            "Você não tem nenhuma organização ativa. Configure sua organização ou aceite um convite.",
            idioma,
          )}
        </p>
        <Link className="text-primary underline underline-offset-4" href="/get-started">
          {traduzir("Configurar minha organização", idioma)}
        </Link>
      </div>
    );
  }
  const { id, rascunho } = await searchParams;
  // ?rascunho= é a ponta da caixa de entrada da issue #1611.
  // Quando omitido, busca automaticamente se a conversa já possui um rascunho ativo não consumido.
  let avisoDeRascunho: AvisoDeRascunho | null = null;
  if (id) {
    const db = await createClient();
    if (rascunho) {
      avisoDeRascunho = {
        conversationId: id,
        leitura: await lerRascunho(db, {
          organizationId: activeOrg.orgId,
          conversationId: id,
          draftId: rascunho,
        }),
      };
    } else {
      const leitura = await lerUltimoRascunhoAtivo(db, {
        organizationId: activeOrg.orgId,
        conversationId: id,
      });
      if (leitura) {
        avisoDeRascunho = {
          conversationId: id,
          leitura,
        };
      }
    }
  }
  return <InboxLayout initialSelectedId={id ?? null} rascunho={avisoDeRascunho} />;
}
