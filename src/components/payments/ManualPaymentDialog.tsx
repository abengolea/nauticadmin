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
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Camera, FileText, ImagePlus, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { compressImageForUpload } from '@/lib/image-compress';
import type { ParsedPaymentReceipt } from '@/ai/flows/parse-payment-receipt';

const RECEIPT_TYPE_LABELS: Record<string, string> = {
  cheque: 'Cheque',
  transfer: 'Transferencia',
  credit_card: 'Cupón tarjeta',
};

export interface ManualPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  /** Lista de jugadores activos */
  activePlayers: { id: string; firstName?: string; lastName?: string }[];
  /** Cuotas adeudadas por jugador (se carga al seleccionar jugador) */
  unpaidPeriods: { period: string; amount: number; currency: string; label: string }[];
  unpaidLoading: boolean;
  onFetchUnpaid: (playerId: string) => void;
  onSuccess?: () => void;
}

export function ManualPaymentDialog({
  open,
  onOpenChange,
  schoolId,
  activePlayers,
  unpaidPeriods,
  unpaidLoading,
  onFetchUnpaid,
  onSuccess,
}: ManualPaymentDialogProps) {
  const { toast } = useToast();
  const [playerId, setPlayerId] = useState('');
  const [period, setPeriod] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('ARS');
  const [paymentDate, setPaymentDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [isCheque, setIsCheque] = useState(false);
  const [chequeDueDate, setChequeDueDate] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptType, setReceiptType] = useState<'cheque' | 'transfer' | 'credit_card' | null>(null);
  const [receiptDetails, setReceiptDetails] = useState<Record<string, string | number | undefined> | null>(null);
  const [processingReceipt, setProcessingReceipt] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const resetForm = useCallback(() => {
    setPlayerId('');
    setPeriod('');
    setAmount('');
    setCurrency('ARS');
    setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
    setMethod('');
    setReference('');
    setIsCheque(false);
    setChequeDueDate('');
    setReceiptFile(null);
    setReceiptPreview(null);
    setReceiptType(null);
    setReceiptDetails(null);
  }, []);

  useEffect(() => {
    if (open && playerId) {
      onFetchUnpaid(playerId);
    }
  }, [open, playerId, onFetchUnpaid]);

  useEffect(() => {
    if (!open) {
      resetForm();
      setCameraOpen(false);
    }
  }, [open, resetForm]);

  useEffect(() => {
    const first = unpaidPeriods[0];
    if (first) {
      setPeriod(first.period);
      setAmount(String(first.amount));
      setCurrency(first.currency || 'ARS');
    } else if (playerId && !unpaidLoading) {
      setPeriod('');
      setAmount('');
    }
  }, [unpaidPeriods, playerId, unpaidLoading]);

  const processReceiptFile = useCallback(
    async (file: File) => {
      const user = getAuth().currentUser;
      if (!user || !schoolId) return;
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
        const res = await fetch('/api/payments/comprobante/process', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const data = await res.json();
        if (data.parseError) {
          toast({ title: 'Comprobante guardado', description: data.parseError });
        }
        if (data.extracted) {
          const ex = data.extracted as ParsedPaymentReceipt;
          setReceiptType(ex.documentType);
          const details: Record<string, string | number | undefined> = {};
          if (ex.bank) details.bank = ex.bank;
          if (ex.chequeNumber) details.chequeNumber = ex.chequeNumber;
          if (ex.chequeDueDate) details.chequeDueDate = ex.chequeDueDate;
          if (ex.referenceNumber) details.referenceNumber = ex.referenceNumber;
          setReceiptDetails(details);
          const methodLabel = RECEIPT_TYPE_LABELS[ex.documentType] ?? ex.documentType;
          const refParts: string[] = [];
          if (ex.chequeNumber) refParts.push(`Cheque nº ${ex.chequeNumber}`);
          if (ex.referenceNumber) refParts.push(`Op. ${ex.referenceNumber}`);
          const isoDate = ex.date ? ex.date.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1') : undefined;
          const isoDueDate = ex.chequeDueDate ? ex.chequeDueDate.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1') : undefined;
          setAmount((prev) => String(ex.amount || parseFloat(prev) || 0));
          setPaymentDate((prev) => isoDate || prev);
          setMethod((prev) => prev || methodLabel + (ex.bank ? ` - ${ex.bank}` : ''));
          setReference((prev) => prev || refParts.join(' / '));
          if (ex.documentType === 'cheque') {
            setIsCheque(true);
            setChequeDueDate((prev) => isoDueDate ?? prev);
          }
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
    [schoolId, toast]
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

  const handleRegister = async () => {
    const numAmount = parseFloat(amount);
    if (!playerId || Number.isNaN(numAmount) || numAmount <= 0) {
      toast({ title: 'Completá cliente y monto válido', variant: 'destructive' });
      return;
    }
    if (!period?.trim()) {
      toast({ title: 'Completá el período (ej: 2026-02 o inscripcion)', variant: 'destructive' });
      return;
    }
    if (isCheque && !chequeDueDate?.trim()) {
      toast({ title: 'Para cheques es obligatoria la fecha de vencimiento', variant: 'destructive' });
      return;
    }
    const user = getAuth().currentUser;
    if (!user || !schoolId) return;

    setSaving(true);
    try {
      const token = await user.getIdToken();
      const formData = new FormData();
      formData.append('playerId', playerId);
      formData.append('schoolId', schoolId);
      formData.append('period', period);
      formData.append('amount', numAmount.toString());
      formData.append('currency', currency);
      formData.append('isCheque', String(isCheque));
      if (isCheque && chequeDueDate) formData.append('chequeDueDate', chequeDueDate);
      if (method.trim()) formData.append('method', method.trim());
      if (reference.trim()) formData.append('reference', reference.trim());
      if (receiptFile) formData.append('file', receiptFile);

      const res = await fetch('/api/payments/manual', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Error al registrar cobro');
      }

      toast({ title: 'Cobro registrado correctamente' });
      onOpenChange(false);
      resetForm();
      onSuccess?.();
    } catch (e) {
      toast({
        title: 'Error al registrar cobro',
        description: e instanceof Error ? e.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar cobro manual</DialogTitle>
            <DialogDescription>
              Registrá un cobro recibido fuera del sistema (efectivo, transferencia, etc.). Sacá una foto o cargá un PDF para que la IA cargue los datos automáticamente. El monto se ajusta según la embarcación del cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>Cliente</Label>
              <Select value={playerId} onValueChange={setPlayerId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Elegí un cliente" />
                </SelectTrigger>
                <SelectContent>
                  {activePlayers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {[p.firstName, p.lastName].filter(Boolean).join(' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {playerId && (
              <div>
                <Label>Imputar a la cuota</Label>
                {unpaidLoading ? (
                  <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando cuotas adeudadas…
                  </p>
                ) : unpaidPeriods.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-1">
                    Este cliente no tiene cuotas adeudadas. Podés registrar un pago adelantado con período manual.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2 max-h-48 overflow-y-auto rounded-md border p-2">
                    {unpaidPeriods.map((u) => (
                      <label
                        key={u.period}
                        className={`flex items-center justify-between gap-2 p-2 rounded cursor-pointer hover:bg-muted/50 ${
                          period === u.period ? 'bg-muted' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name="manual-period"
                          checked={period === u.period}
                          onChange={() => {
                            setPeriod(u.period);
                            setAmount(String(u.amount));
                            setCurrency(u.currency || 'ARS');
                          }}
                          className="sr-only"
                        />
                        <span className="font-medium">{u.label}</span>
                        <span className="text-sm text-muted-foreground">
                          {u.currency} {u.amount.toLocaleString('es-AR')}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(!playerId || unpaidPeriods.length === 0) && (
              <div>
                <Label>Período (YYYY-MM) — pago adelantado</Label>
                <Input
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  placeholder="2026-02 o inscripcion"
                  className="mt-1"
                />
              </div>
            )}

            <div>
              <Label>Comprobante (opcional)</Label>
              <p className="text-xs text-muted-foreground mb-2">
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
                    <img src={receiptPreview} alt="" className="h-12 w-12 object-cover rounded" />
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
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Subiendo y extrayendo datos con IA...
                </p>
              )}
            </div>

            <div>
              <Label>Monto ({currency})</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Fecha</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Método (opcional)</Label>
              <Input
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                placeholder="Transferencia, Efectivo, Cheque..."
                className="mt-1"
              />
            </div>

            <div>
              <Label>Referencia (opcional)</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Nº operación, cheque..."
                className="mt-1"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="manual-is-cheque"
                checked={isCheque}
                onCheckedChange={(c) => setIsCheque(!!c)}
              />
              <Label htmlFor="manual-is-cheque" className="cursor-pointer">
                Es cheque (pendiente de cobrar en banco)
              </Label>
            </div>
            {isCheque && (
              <div>
                <Label>Fecha de vencimiento del cheque (obligatoria)</Label>
                <Input
                  type="date"
                  value={chequeDueDate}
                  onChange={(e) => setChequeDueDate(e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  El día del vencimiento aparecerá una alarma para recordar cobrarlo.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleRegister} disabled={saving || !amount || !period}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar cobro'}
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
