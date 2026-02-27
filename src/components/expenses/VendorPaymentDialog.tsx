'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { getAuth } from 'firebase/auth';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Camera, FileText, ImagePlus, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { compressImageForUpload } from '@/lib/image-compress';
import type { ParsedPaymentReceipt } from '@/ai/flows/parse-payment-receipt';

const RECEIPT_TYPE_LABELS: Record<string, string> = {
  cheque: 'Cheque',
  transfer: 'Transferencia',
  credit_card: 'Cupón tarjeta',
};

export interface VendorPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  vendorId: string;
  /** Optional: expenseId to pre-fill appliedTo */
  expenseId?: string;
  /** Optional: amount to pre-fill */
  suggestedAmount?: number;
  /** Optional: custom dialog title */
  title?: string;
  onSuccess?: () => void;
}

export function VendorPaymentDialog({
  open,
  onOpenChange,
  schoolId,
  vendorId,
  expenseId,
  suggestedAmount,
  title = 'Pagar factura',
  onSuccess,
}: VendorPaymentDialogProps) {
  const { toast } = useToast();
  const [paymentForm, setPaymentForm] = useState({
    amount: suggestedAmount ? String(suggestedAmount) : '',
    date: format(new Date(), 'yyyy-MM-dd'),
    method: '',
    reference: '',
  });
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptStoragePath, setReceiptStoragePath] = useState<string | null>(null);
  const [receiptType, setReceiptType] = useState<'cheque' | 'transfer' | 'credit_card' | null>(null);
  const [receiptDetails, setReceiptDetails] = useState<Record<string, string | number | undefined> | null>(null);
  const [processingReceipt, setProcessingReceipt] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const resetForm = useCallback(() => {
    setPaymentForm({
      amount: suggestedAmount ? String(suggestedAmount) : '',
      date: format(new Date(), 'yyyy-MM-dd'),
      method: '',
      reference: '',
    });
    setReceiptFile(null);
    setReceiptPreview(null);
    setReceiptStoragePath(null);
    setReceiptType(null);
    setReceiptDetails(null);
  }, [suggestedAmount]);

  const processReceiptFile = useCallback(
    async (file: File) => {
      const user = getAuth().currentUser;
      if (!user || !schoolId || !vendorId) return;
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf';
      if (!isImage && !isPdf) {
        toast({ title: 'Solo imágenes o PDF', variant: 'destructive' });
        return;
      }
      setProcessingReceipt(true);
      try {
        const token = await user.getIdToken();
        const fileToUpload = isImage ? await compressImageForUpload(file) : file;
        const formData = new FormData();
        formData.append('file', fileToUpload);
        formData.append('schoolId', schoolId);
        formData.append('vendorId', vendorId);
        const res = await fetch('/api/expenses/payment-receipts/process', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const data = await res.json();
        if (data.parseError) {
          toast({ title: 'Comprobante guardado', description: data.parseError });
        }
        setReceiptStoragePath(data.storagePath ?? null);
        if (data.extracted) {
          const ex = data.extracted as ParsedPaymentReceipt;
          setReceiptType(ex.documentType);
          const details: Record<string, string | number | undefined> = {};
          if (ex.bank) details.bank = ex.bank;
          if (ex.chequeNumber) details.chequeNumber = ex.chequeNumber;
          if (ex.issuer) details.issuer = ex.issuer;
          if (ex.payee) details.payee = ex.payee;
          if (ex.referenceNumber) details.referenceNumber = ex.referenceNumber;
          if (ex.fromAccount) details.fromAccount = ex.fromAccount;
          if (ex.toAccount) details.toAccount = ex.toAccount;
          if (ex.cardType) details.cardType = ex.cardType;
          if (ex.last4) details.last4 = ex.last4;
          if (ex.establishment) details.establishment = ex.establishment;
          setReceiptDetails(details);
          const methodLabel = RECEIPT_TYPE_LABELS[ex.documentType] ?? ex.documentType;
          const refParts: string[] = [];
          if (ex.chequeNumber) refParts.push(`Cheque nº ${ex.chequeNumber}`);
          if (ex.referenceNumber) refParts.push(`Op. ${ex.referenceNumber}`);
          if (ex.last4) refParts.push(`****${ex.last4}`);
          setPaymentForm((f) => ({
            ...f,
            amount: String(ex.amount || f.amount),
            date: ex.date ? ex.date.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1') : f.date,
            method: f.method || methodLabel + (ex.bank ? ` - ${ex.bank}` : ''),
            reference: f.reference || refParts.join(' / '),
          }));
          toast({ title: 'Datos extraídos con IA' });
        }
      } catch (e) {
        toast({
          title: 'Error al procesar',
          description: e instanceof Error ? e.message : 'Error desconocido',
          variant: 'destructive',
        });
      } finally {
        setProcessingReceipt(false);
      }
    },
    [schoolId, vendorId, toast]
  );

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setReceiptPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setReceiptPreview(null);
    }
    processReceiptFile(file);
    e.target.value = '';
  };

  const handleCameraCapture = () => {
    const video = videoRef.current;
    if (!video || !streamRef.current || video.readyState < 2) return;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `comprobante-${Date.now()}.jpg`, { type: 'image/jpeg' });
        setReceiptFile(file);
        setReceiptPreview(URL.createObjectURL(blob));
        setCameraOpen(false);
        processReceiptFile(file);
      },
      'image/jpeg',
      0.9
    );
  };

  useEffect(() => {
    if (!cameraOpen) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .catch(() => navigator.mediaDevices.getUserMedia({ video: true }))
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraOpen]);

  useEffect(() => {
    if (!open) {
      resetForm();
      setCameraOpen(false);
    } else if (suggestedAmount) {
      setPaymentForm((f) => ({ ...f, amount: String(suggestedAmount) }));
    }
  }, [open, resetForm, suggestedAmount]);

  const handleRegisterPayment = async () => {
    const amount = parseFloat(paymentForm.amount);
    if (!amount || amount <= 0) {
      toast({ title: 'Ingresá un monto válido', variant: 'destructive' });
      return;
    }
    const user = getAuth().currentUser;
    if (!user || !schoolId || !vendorId) return;

    setPaymentSaving(true);
    try {
      const token = await user.getIdToken();
      const appliedTo = expenseId ? [{ expenseId, amount }] : [];
      const res = await fetch('/api/expenses/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId,
          vendorId,
          amount,
          currency: 'ARS',
          date: paymentForm.date,
          method: paymentForm.method.trim() || undefined,
          reference: paymentForm.reference.trim() || undefined,
          receiptType: receiptType ?? undefined,
          receiptStoragePath: receiptStoragePath ?? undefined,
          receiptDetails: receiptDetails ?? undefined,
          appliedTo,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Error al registrar pago');
      }

      toast({ title: 'Pago registrado correctamente' });
      onOpenChange(false);
      resetForm();
      onSuccess?.();
    } catch (e) {
      toast({
        title: 'Error al registrar pago',
        description: e instanceof Error ? e.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setPaymentSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Comprobante (opcional)</Label>
              <p className="text-xs text-muted-foreground">
                Sacá una foto o cargá un PDF para que la IA cargue los datos automáticamente.
              </p>
              <input
                ref={receiptInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleReceiptFileChange}
              />
              {receiptFile ? (
                <div className="flex items-center gap-2 rounded-lg border p-2 bg-muted/30">
                  {receiptPreview ? (
                    <img
                      src={receiptPreview}
                      alt=""
                      className="h-12 w-12 object-cover rounded"
                    />
                  ) : (
                    <FileText className="h-12 w-12 text-muted-foreground" />
                  )}
                  <span className="flex-1 truncate text-sm">{receiptFile.name}</span>
                  {receiptType && (
                    <span className="text-xs text-muted-foreground">
                      {RECEIPT_TYPE_LABELS[receiptType]}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setReceiptFile(null);
                      setReceiptPreview(null);
                      setReceiptStoragePath(null);
                      setReceiptType(null);
                      setReceiptDetails(null);
                    }}
                    disabled={processingReceipt}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCameraOpen(true)}
                    disabled={processingReceipt}
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Tomar foto
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => receiptInputRef.current?.click()}
                    disabled={processingReceipt}
                  >
                    <ImagePlus className="h-4 w-4 mr-2" />
                    Cargar PDF o imagen
                  </Button>
                </div>
              )}
              {processingReceipt && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Subiendo y extrayendo datos con IA...
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Monto (ARS)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input
                type="date"
                value={paymentForm.date}
                onChange={(e) => setPaymentForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Método (opcional)</Label>
              <Input
                value={paymentForm.method}
                onChange={(e) => setPaymentForm((f) => ({ ...f, method: e.target.value }))}
                placeholder="Transferencia, Efectivo, Cheque..."
              />
            </div>
            <div className="space-y-2">
              <Label>Referencia (opcional)</Label>
              <Input
                value={paymentForm.reference}
                onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))}
                placeholder="Nº operación, cheque..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={paymentSaving}>
              Cancelar
            </Button>
            <Button onClick={handleRegisterPayment} disabled={paymentSaving || !paymentForm.amount}>
              {paymentSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar pago'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cameraOpen} onOpenChange={setCameraOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tomar foto del comprobante</DialogTitle>
          </DialogHeader>
          <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-muted">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCameraOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCameraCapture}>
              <Camera className="h-4 w-4 mr-2" />
              Capturar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
