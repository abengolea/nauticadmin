"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Paperclip, FileText, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PaymentDocumentoAdjuntoProps {
  paymentId: string;
  schoolId: string;
  getToken: () => Promise<string | null>;
  hasAdjunto?: boolean;
  adjuntoNombre?: string;
  onUpdated?: () => void;
}

export function PaymentDocumentoAdjunto({
  paymentId,
  schoolId,
  getToken,
  hasAdjunto,
  adjuntoNombre,
  onUpdated,
}: PaymentDocumentoAdjuntoProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleView = async () => {
    setViewing(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(
        `/api/payments/${paymentId}/documento-adjunto-url?schoolId=${encodeURIComponent(schoolId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo abrir el documento");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast({
        variant: "destructive",
        title: e instanceof Error ? e.message : "Error al abrir documento",
      });
    } finally {
      setViewing(false);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({ variant: "destructive", title: "Seleccioná un PDF" });
      return;
    }
    setUploading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const formData = new FormData();
      formData.append("schoolId", schoolId);
      formData.append("file", file);
      if (descripcion.trim()) formData.append("descripcion", descripcion.trim());

      const res = await fetch(`/api/payments/${paymentId}/documento-adjunto`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al subir");

      toast({ title: "Documento adjunto guardado" });
      setOpen(false);
      setFile(null);
      setDescripcion("");
      onUpdated?.();
    } catch (e) {
      toast({
        variant: "destructive",
        title: e instanceof Error ? e.message : "Error al subir",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm("¿Quitar el documento adjunto de este cobro?")) return;
    setUploading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(
        `/api/payments/${paymentId}/documento-adjunto?schoolId=${encodeURIComponent(schoolId)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al quitar");
      }
      toast({ title: "Documento quitado" });
      onUpdated?.();
    } catch (e) {
      toast({
        variant: "destructive",
        title: e instanceof Error ? e.message : "Error",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {hasAdjunto ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={viewing}
            onClick={handleView}
            title={adjuntoNombre ?? "Ver PDF adjunto"}
          >
            {viewing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            disabled={uploading}
            onClick={() => setOpen(true)}
            title="Reemplazar PDF"
          >
            <Paperclip className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => setOpen(true)}
          title="Adjuntar PDF opcional"
        >
          <Paperclip className="h-3.5 w-3.5" />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Documento adjunto (opcional)</DialogTitle>
            <DialogDescription>
              PDF adicional al cobro (remito, nota, comprobante extra). No reemplaza la factura
              emitida por el sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div>
              <Label htmlFor={`adjunto-${paymentId}`}>Archivo PDF</Label>
              <Input
                id={`adjunto-${paymentId}`}
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="mt-1"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <Label htmlFor={`adj-desc-${paymentId}`}>Descripción (opcional)</Label>
              <Input
                id={`adj-desc-${paymentId}`}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej: Remito, nota de débito..."
                className="mt-1"
                maxLength={200}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {hasAdjunto && (
              <Button
                type="button"
                variant="outline"
                className="text-destructive sm:mr-auto"
                disabled={uploading}
                onClick={handleRemove}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Quitar
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={uploading || !file} onClick={handleUpload}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
