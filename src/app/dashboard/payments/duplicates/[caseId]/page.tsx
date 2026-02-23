"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useUserProfile, useFirebase } from "@/firebase";
import { getAuth } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, ArrowLeft, Check } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

type ResolutionType = "invoice_one_credit_rest" | "invoice_all" | "refund_one" | "ignore_duplicates";

interface PaymentInfo {
  id: string;
  amount: number;
  currency: string;
  paidAt: string | Date;
  provider: string;
  providerPaymentId?: string;
  period: string;
}

interface CaseDetail {
  case: {
    id: string;
    schoolId: string;
    customerId: string;
    paymentIds: string[];
    status: string;
  };
  payments: PaymentInfo[];
  customerName: string;
}

export default function DuplicateCaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = use(params);
  const { profile, isReady, isAdmin } = useUserProfile();
  const { app } = useFirebase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const schoolId = searchParams.get("schoolId") ?? profile?.activeSchoolId;
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [resolutionType, setResolutionType] = useState<ResolutionType>("invoice_one_credit_rest");
  const [chosenPaymentId, setChosenPaymentId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const getToken = useCallback(async () => {
    const auth = getAuth(app);
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken();
  }, [app]);

  const fetchDetail = useCallback(async () => {
    if (!schoolId) return;
    const token = await getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/duplicate-cases/${caseId}?schoolId=${schoolId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 404) router.push("/dashboard/payments/duplicates");
        return;
      }
      const data = await res.json();
      setDetail(data);
      if (data.payments?.length > 0 && !chosenPaymentId) {
        setChosenPaymentId(data.payments[0].id);
      }
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [schoolId, caseId, getToken, chosenPaymentId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  useEffect(() => {
    if (!isReady) return;
    if (!profile) {
      router.push("/auth/pending-approval");
      return;
    }
    if (!isAdmin) {
      router.push("/dashboard");
      return;
    }
  }, [isReady, profile, isAdmin, router]);

  const handleResolve = async () => {
    if (!schoolId || !detail) return;
    const token = await getToken();
    if (!token) return;

    const chosenPaymentIds =
      resolutionType === "invoice_one_credit_rest" || resolutionType === "refund_one"
        ? [chosenPaymentId]
        : detail.case.paymentIds;

    if (
      (resolutionType === "invoice_one_credit_rest" || resolutionType === "refund_one") &&
      !chosenPaymentId
    ) {
      toast({ title: "Seleccioná un pago", variant: "destructive" });
      return;
    }

    setResolving(true);
    try {
      const res = await fetch(`/api/duplicate-cases/${caseId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          schoolId,
          type: resolutionType,
          chosenPaymentIds,
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? "Error al resolver", variant: "destructive" });
        return;
      }

      toast({
        title: "Caso resuelto",
        description: `Se crearon ${data.invoiceOrderIds?.length ?? 0} orden(es) de facturación`,
      });
      setConfirmOpen(false);
      router.push(`/dashboard/payments/duplicates?schoolId=${schoolId}`);
    } catch {
      toast({ title: "Error al resolver", variant: "destructive" });
    } finally {
      setResolving(false);
    }
  };

  if (!isReady || !profile) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!schoolId) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Falta schoolId</p>
        <Button variant="link" asChild>
          <Link href="/dashboard/payments">Volver a Pagos</Link>
        </Button>
      </div>
    );
  }

  if (loading || !detail) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (detail.case.status !== "open") {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Este caso ya fue resuelto</p>
        <Button variant="link" asChild>
          <Link href={`/dashboard/payments/duplicates?schoolId=${schoolId}`}>
            Volver a Duplicados
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dashboard/payments/duplicates?schoolId=${schoolId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Caso de duplicado</h1>
          <p className="text-muted-foreground text-sm">
            Cliente: {detail.customerName} • {detail.payments.length} pagos
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pagos involucrados</CardTitle>
          <CardDescription>Seleccioná la acción a realizar</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Fecha pago</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.id.slice(0, 8)}…</TableCell>
                  <TableCell>
                    {p.currency} {p.amount.toLocaleString("es-AR")}
                  </TableCell>
                  <TableCell>{p.period}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{p.provider}</Badge>
                  </TableCell>
                  <TableCell>
                    {format(
                      typeof p.paidAt === "string" ? new Date(p.paidAt) : p.paidAt,
                      "d MMM yyyy, HH:mm",
                      { locale: es }
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resolución</CardTitle>
          <CardDescription>Elegí qué hacer con los pagos duplicados</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup
            value={resolutionType}
            onValueChange={(v) => setResolutionType(v as ResolutionType)}
          >
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="invoice_one_credit_rest" id="r1" />
              <Label htmlFor="r1" className="font-normal cursor-pointer">
                <strong>Facturar 1 y dejar crédito el resto</strong> — Facturá un pago y el resto queda como saldo a favor del cliente
              </Label>
            </div>
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="invoice_all" id="r2" />
              <Label htmlFor="r2" className="font-normal cursor-pointer">
                <strong>Facturar todos</strong> — Emitir una factura por el total de todos los pagos
              </Label>
            </div>
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="refund_one" id="r3" />
              <Label htmlFor="r3" className="font-normal cursor-pointer">
                <strong>Reembolsar uno</strong> — Marcar un pago como reembolsado/anulado
              </Label>
            </div>
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="ignore_duplicates" id="r4" />
              <Label htmlFor="r4" className="font-normal cursor-pointer">
                <strong>Ignorar</strong> — Falso positivo, no son duplicados
              </Label>
            </div>
          </RadioGroup>

          {(resolutionType === "invoice_one_credit_rest" || resolutionType === "refund_one") && (
            <div className="space-y-2">
              <Label>Pago a facturar / reembolsar</Label>
              <RadioGroup
                value={chosenPaymentId}
                onValueChange={setChosenPaymentId}
                className="flex flex-col gap-2"
              >
                {detail.payments.map((p) => (
                  <div key={p.id} className="flex items-center space-x-2">
                    <RadioGroupItem value={p.id} id={`pay-${p.id}`} />
                    <Label htmlFor={`pay-${p.id}`} className="font-normal cursor-pointer">
                      {p.currency} {p.amount.toLocaleString("es-AR")} — {p.period} — {p.provider}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Motivo de la resolución..."
              rows={3}
            />
          </div>

          <Button onClick={() => setConfirmOpen(true)} disabled={resolving}>
            {resolving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Resolver caso
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar resolución?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se crearán órdenes de facturación según la opción elegida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleResolve} disabled={resolving}>
              {resolving ? "Procesando…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
