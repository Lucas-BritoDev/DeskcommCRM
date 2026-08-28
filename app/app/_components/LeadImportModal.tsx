"use client";

import { useState } from "react";
import { read, utils } from "xlsx";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { importLeadsAction } from "@/app/actions/kanban/importLeads";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pipelineId: string;
  stageId: string;
}

interface ParsedLead {
  name: string;
  phone: string;
  [key: string]: any;
}

export function LeadImportModal({ open, onOpenChange, pipelineId, stageId }: Props) {
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedLead[]>([]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        if (!wsname) throw new Error("Planilha vazia");
        const ws = wb.Sheets[wsname];
        if (!ws) throw new Error("Aba da planilha não encontrada");
        
        // Converte para JSON. Assume cabeçalhos na primeira linha.
        const data = utils.sheet_to_json(ws) as Record<string, any>[];
        
        const mapped: ParsedLead[] = data.map(row => {
          // Tentando encontrar colunas típicas de nome e telefone
          const keys = Object.keys(row);
          if (keys.length === 0) return { name: "", phone: "", raw: row };

          const nameKey = (keys.find(k => k.toLowerCase().includes("nome")) || keys[0]) as string;
          const phoneKey = (keys.find(k => k.toLowerCase().includes("telefone") || k.toLowerCase().includes("celular") || k.toLowerCase().includes("numero") || k.toLowerCase().includes("phone")) || (keys.length > 1 ? keys[1] : keys[0])) as string;

          return {
            name: String(row[nameKey] || ""),
            phone: String(row[phoneKey] || ""),
            raw: row
          };
        }).filter(r => r.name || r.phone); // Pelo menos um dos dois

        setPreview(mapped);
      } catch (err) {
        toast.error("Falha ao ler o arquivo. Certifique-se de que é um Excel ou CSV válido.");
        setFile(null);
        setPreview([]);
      }
    };
    reader.readAsBinaryString(selected);
  }

  async function handleImport() {
    if (preview.length === 0) {
      toast.error("Nenhum lead encontrado na planilha.");
      return;
    }

    setLoading(true);
    try {
      const result = await importLeadsAction({
        pipelineId,
        stageId,
        leads: preview.map(l => ({
          title: l.name || "Lead Importado",
          phone: l.phone,
          custom_fields: l.raw
        }))
      });

      if (!result.ok) {
        throw new Error(result.error);
      }

      toast.success(`${result.importedCount} leads importados com sucesso!`);
      onOpenChange(false);
      window.location.reload(); // Recarrega para ver os leads novos
    } catch (err: any) {
      toast.error(err.message || "Erro desconhecido ao importar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar Leads</DialogTitle>
          <DialogDescription>
            Faça upload de uma planilha (Excel ou CSV) contendo os leads. O sistema tentará localizar as colunas de "Nome" e "Telefone/Celular".
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="file">Arquivo de Planilha</Label>
            <Input id="file" type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} disabled={loading} />
          </div>

          {preview.length > 0 && (
            <div className="rounded-md border p-4 bg-muted/50 text-sm">
              <p className="font-medium mb-2">Pré-visualização ({preview.length} encontrados):</p>
              <ul className="max-h-[150px] overflow-auto space-y-1">
                {preview.slice(0, 5).map((l, i) => (
                  <li key={i} className="flex justify-between border-b pb-1">
                    <span>{l.name || "(Sem nome)"}</span>
                    <span className="text-muted-foreground">{l.phone || "(Sem tel)"}</span>
                  </li>
                ))}
                {preview.length > 5 && (
                  <li className="text-center text-xs text-muted-foreground pt-2">
                    E mais {preview.length - 5} leads...
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={loading || preview.length === 0}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Importação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
