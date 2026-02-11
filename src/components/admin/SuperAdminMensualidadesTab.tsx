"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  DollarSign,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Settings,
  Check,
  HandCoins,
} from "lucide-react";
import { useUserProfile } from "@/firebase";
import type { School } from "@/lib/types";
import type { SchoolFeeDelinquent, SchoolFeePayment, PlatformFeeConfig, SchoolFeeConfig } from "@/lib/types/platform-fee";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

function formatPeriod(period: string): string {
  if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return period;
  const [y, m] = period.split("-");
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  return format(date, "MMMM yyyy", { locale: es });
}

interface SuperAdminMensualidadesTabProps {
  schools: School[] | null;
}

export function SuperAdminMensualidadesTab({ schools }: SuperAdminMensualidadesTabProps) {
  const { user } = useUserProfile();
  const { toast } = useToast();
  const [delinquents, setDelinquents] = useState<SchoolFeeDelinquent[]>([]);
  const [payments, setPayments] = useState<SchoolFeePayment[]>([]);
  const [config, setConfig] = useState<PlatformFeeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualDialog, setManualDialog] = useState<SchoolFeeDelinquent | null>(null);
  const [manualAmount, setManualAmount] = useState("");
  const [configDialog, setConfigDialog] = useState(false);
  const [configForm, setConfigForm] = useState<Partial<PlatformFeeConfig>>({});
  const [schoolFeeDialog, setSchoolFeeDialog] = useState<School | null>(null);
  const [schoolFeeForm, setSchoolFeeForm] = useState<SchoolFeeConfig | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payingFor, setPayingFor] = useState<string | null>(null);
  const [schoolConfigs, setSchoolConfigs] = useState<Record<string, SchoolFeeConfig>>({});

  const getToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken().catch(() => null);
  }, [user]);

  const fetchData = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setLoading(true);
    try {
      const [delRes, payRes, cfgRes] = await Promise.all([
        fetch("/api/platform-fee/delinquents", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/platform-fee/payments?limit=50", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/platform-fee/config", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (delRes.ok) {
        const d = await delRes.json();
        setDelinquents(
          d.delinquents.map((x: SchoolFeeDelinquent & { dueDate: string }) => ({
            ...x,
            dueDate: new Date(x.dueDate),
          }))
        );
      }
      if (payRes.ok) {
        const p = await payRes.json();
        setPayments(p.payments);
      }
      if (cfgRes.ok) {
        const c = await cfgRes.json();
        setConfig(c);
        setConfigForm({
          dueDayOfMonth: c.dueDayOfMonth,
          delinquencyDaysWarning: c.delinquencyDaysWarning,
          delinquencyDaysSuspension: c.delinquencyDaysSuspension,
          lateFeePercent: c.lateFeePercent,
          defaultMonthlyAmount: c.defaultMonthlyAmount,
        });
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "No se pudo cargar la información", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [getToken, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!schools?.length || !user) return;
    const load = async () => {
      const token = await getToken();
      if (!token) return;
      const configs: Record<string, SchoolFeeConfig> = {};
      await Promise.all(
        schools.map(async (s) => {
          const res = await fetch(`/api/platform-fee/schools/${s.id}/config`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const c = await res.json();
            configs[s.id] = c;
          }
        })
      );
      setSchoolConfigs(configs);
    };
    load();
  }, [schools, user, getToken]);

  const handlePayLink = async (d: SchoolFeeDelinquent) => {
    const token = await getToken();
    if (!token) return;
    setPayingFor(`${d.schoolId}-${d.period}`);
    try {
      const res = await fetch("/api/platform-fee/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ schoolId: d.schoolId, period: d.period }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear link");
      if (data.checkoutUrl) window.open(data.checkoutUrl, "_blank");
      else toast({ title: "Sin link", description: "Mercado Pago no está configurado", variant: "destructive" });
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setPayingFor(null);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualDialog) return;
    const token = await getToken();
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/platform-fee/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          schoolId: manualDialog.schoolId,
          period: manualDialog.period,
          amount: manualAmount ? parseFloat(manualAmount) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al registrar");
      toast({ title: "Pago registrado", description: "La mensualidad fue marcada como pagada." });
      setManualDialog(null);
      setManualAmount("");
      fetchData();
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveConfig = async () => {
    const token = await getToken();
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/platform-fee/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(configForm),
      });
      if (!res.ok) throw new Error("Error al guardar");
      toast({ title: "Configuración guardada" });
      setConfigDialog(false);
      fetchData();
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const fetchSchoolConfig = useCallback(async (schoolId: string) => {
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`/api/platform-fee/schools/${schoolId}/config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const c = await res.json();
      setSchoolConfigs((prev) => ({ ...prev, [schoolId]: c }));
      return c;
    }
    return null;
  }, [getToken]);

  const handleOpenSchoolFee = async (school: School) => {
    setSchoolFeeDialog(school);
    const cfg = schoolConfigs[school.id] ?? (await fetchSchoolConfig(school.id));
    setSchoolFeeForm(cfg ? { ...cfg } : { monthlyAmount: 0, isBonified: false, updatedAt: new Date(), updatedBy: "" });
  };

  const handleSaveSchoolFee = async () => {
    if (!schoolFeeDialog || !schoolFeeForm) return;
    const token = await getToken();
    if (!token) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/platform-fee/schools/${schoolFeeDialog.id}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ monthlyAmount: schoolFeeForm.monthlyAmount, isBonified: schoolFeeForm.isBonified }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      toast({ title: "Tarifa guardada" });
      setSchoolFeeDialog(null);
      setSchoolFeeForm(null);
      setSchoolConfigs((prev) => ({ ...prev, [schoolFeeDialog.id]: schoolFeeForm }));
      fetchData();
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const bonifiedCount = Object.values(schoolConfigs).filter((c) => c.isBonified).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Mensualidades de Escuelas</h2>
          <p className="text-sm text-muted-foreground">
            Control de pagos de escuelas adheridas a la plataforma.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setConfigDialog(true)}>
          <Settings className="h-4 w-4 mr-2" />
          Configuración global
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              En mora
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{delinquents.length}</div>}
            <p className="text-xs text-muted-foreground">Escuelas con cuotas pendientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              Pagos este mes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-2xl font-bold">
                {payments.filter((p) => p.period === format(new Date(), "yyyy-MM")).length}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Mensualidades ingresadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Bonificadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bonifiedCount}</div>
            <p className="text-xs text-muted-foreground">Escuelas sin cargo (ej. San Nicolás)</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="mora" className="w-full">
        <TabsList>
          <TabsTrigger value="mora">En mora</TabsTrigger>
          <TabsTrigger value="payments">Pagos ingresados</TabsTrigger>
          <TabsTrigger value="tarifas">Tarifas por escuela</TabsTrigger>
        </TabsList>
        <TabsContent value="mora">
          <Card>
            <CardHeader>
              <CardTitle>Escuelas con mensualidades pendientes</CardTitle>
              <CardDescription>
                Podés generar un link de pago a Mercado Pago o registrar pago manual.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-32 w-full" />
              ) : delinquents.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No hay escuelas en mora.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Escuela</TableHead>
                        <TableHead>Período</TableHead>
                        <TableHead>Vencimiento</TableHead>
                        <TableHead>Días atraso</TableHead>
                        <TableHead>Monto</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {delinquents.map((d) => (
                        <TableRow key={`${d.schoolId}-${d.period}`}>
                          <TableCell className="font-medium">
                            {d.schoolName}
                            {d.isSuspended && (
                              <Badge variant="destructive" className="ml-2 text-xs">Suspendida</Badge>
                            )}
                          </TableCell>
                          <TableCell>{formatPeriod(d.period)}</TableCell>
                          <TableCell>{format(d.dueDate, "dd/MM/yyyy", { locale: es })}</TableCell>
                          <TableCell>{d.daysOverdue}</TableCell>
                          <TableCell>
                            ${d.totalAmount.toLocaleString()} {d.currency}
                            {d.lateFeeAmount > 0 && (
                              <span className="text-xs text-muted-foreground ml-1">
                                (+${d.lateFeeAmount} mora)
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePayLink(d)}
                              disabled={!!payingFor}
                            >
                              {payingFor === `${d.schoolId}-${d.period}` ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <ExternalLink className="h-4 w-4" />
                              )}
                              <span className="ml-1">Pagar MP</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setManualDialog(d); setManualAmount(d.totalAmount.toString()); }}
                            >
                              <HandCoins className="h-4 w-4" />
                              <span className="ml-1">Manual</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Pagos de mensualidades</CardTitle>
              <CardDescription>Historial de pagos ingresados por escuelas.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-32 w-full" />
              ) : payments.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No hay pagos registrados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Escuela</TableHead>
                        <TableHead>Período</TableHead>
                        <TableHead>Monto</TableHead>
                        <TableHead>Proveedor</TableHead>
                        <TableHead>Fecha</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{schools?.find((s) => s.id === p.schoolId)?.name ?? p.schoolId}</TableCell>
                          <TableCell>{formatPeriod(p.period)}</TableCell>
                          <TableCell>
                            ${(p.amount + (p.lateFeeAmount ?? 0)).toLocaleString()} {p.currency}
                          </TableCell>
                          <TableCell>{p.provider === "mercadopago" ? "Mercado Pago" : "Manual"}</TableCell>
                          <TableCell>
                            {p.paidAt ? format(new Date(p.paidAt), "dd/MM/yyyy HH:mm", { locale: es }) : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="tarifas">
          <Card>
            <CardHeader>
              <CardTitle>Tarifas por escuela</CardTitle>
              <CardDescription>
                Definí la tarifa mensual de cada escuela. Marcá "Bonificada" para escuelas sin cargo (ej. San Nicolás).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!schools?.length ? (
                <p className="text-center text-muted-foreground py-8">No hay escuelas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Escuela</TableHead>
                        <TableHead>Ubicación</TableHead>
                        <TableHead>Tarifa mensual</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schools.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell>{s.city}, {s.province}</TableCell>
                          <TableCell>
                            {schoolConfigs[s.id]?.isBonified ? (
                              <Badge variant="secondary">Bonificada</Badge>
                            ) : (
                              `$${(schoolConfigs[s.id]?.monthlyAmount ?? 0).toLocaleString()}`
                            )}
                          </TableCell>
                          <TableCell>
                            {!schoolConfigs[s.id] ? (
                              <Button size="sm" variant="ghost" onClick={() => handleOpenSchoolFee(s)}>
                                Configurar
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" onClick={() => handleOpenSchoolFee(s)}>
                              Editar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!schoolFeeDialog} onOpenChange={(o) => !o && (setSchoolFeeDialog(null), setSchoolFeeForm(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tarifa de {schoolFeeDialog?.name}</DialogTitle>
            <DialogDescription>
              Definí si la escuela paga mensualidad o está bonificada.
            </DialogDescription>
          </DialogHeader>
          {schoolFeeForm && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <Label>Bonificada (sin cargo)</Label>
                <Switch
                  checked={schoolFeeForm.isBonified}
                  onCheckedChange={(c) => setSchoolFeeForm((f) => f ? { ...f, isBonified: c } : null)}
                />
              </div>
              <div className="space-y-2">
                <Label>Tarifa mensual ($)</Label>
                <Input
                  type="number"
                  min={0}
                  value={schoolFeeForm.monthlyAmount}
                  onChange={(e) => setSchoolFeeForm((f) => f ? { ...f, monthlyAmount: parseFloat(e.target.value) || 0 } : null)}
                  disabled={schoolFeeForm.isBonified}
                />
                {schoolFeeForm.isBonified && <p className="text-xs text-muted-foreground">Las escuelas bonificadas no tienen tarifa.</p>}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSchoolFeeDialog(null); setSchoolFeeForm(null); }}>Cancelar</Button>
            <Button onClick={handleSaveSchoolFee} disabled={submitting || !schoolFeeForm}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!manualDialog} onOpenChange={(o) => !o && setManualDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar pago manual</DialogTitle>
            <DialogDescription>
              {manualDialog && `${manualDialog.schoolName} - ${formatPeriod(manualDialog.period)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Monto (opcional, usa el calculado si no especificás)</Label>
              <Input
                type="number"
                placeholder={manualDialog?.totalAmount.toString()}
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDialog(null)}>Cancelar</Button>
            <Button onClick={handleManualSubmit} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Registrar pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={configDialog} onOpenChange={setConfigDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configuración global de mensualidades</DialogTitle>
            <DialogDescription>
              Parámetros que aplican a todas las escuelas. La tarifa por escuela se define al editar cada escuela.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Día de vencimiento (1-31)</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={configForm.dueDayOfMonth ?? 10}
                  onChange={(e) => setConfigForm((f) => ({ ...f, dueDayOfMonth: parseInt(e.target.value, 10) || 10 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Días para aviso de mora</Label>
                <Input
                  type="number"
                  min={1}
                  value={configForm.delinquencyDaysWarning ?? 5}
                  onChange={(e) => setConfigForm((f) => ({ ...f, delinquencyDaysWarning: parseInt(e.target.value, 10) || 5 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Días para suspensión</Label>
                <Input
                  type="number"
                  min={1}
                  value={configForm.delinquencyDaysSuspension ?? 30}
                  onChange={(e) => setConfigForm((f) => ({ ...f, delinquencyDaysSuspension: parseInt(e.target.value, 10) || 30 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>% adicional por mora</Label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={configForm.lateFeePercent ?? 5}
                  onChange={(e) => setConfigForm((f) => ({ ...f, lateFeePercent: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Tarifa mensual por defecto ($)</Label>
                <Input
                  type="number"
                  min={0}
                  value={configForm.defaultMonthlyAmount ?? 0}
                  onChange={(e) => setConfigForm((f) => ({ ...f, defaultMonthlyAmount: parseFloat(e.target.value) || 0 }))}
                />
                <p className="text-xs text-muted-foreground">Para escuelas sin tarifa específica</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveConfig} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
