'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUserProfile } from '@/firebase';
import { getAuth } from 'firebase/auth';
import { useFirebase } from '@/firebase';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { ExternalLink, Link2, Ship, CheckCircle2, ArrowLeft, CalendarIcon, Filter, BarChart3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Solicitud = {
  id: string;
  nombreCliente: string;
  nombreEmbarcacion: string;
  status: string;
  createdAt: number | null;
  salioAt: number | null;
  regresoAt: number | null;
  salioOperadorNombre?: string;
  regresoOperadorNombre?: string;
};

type RegistroItem = {
  id: string;
  tipo: 'solicitud_creada' | 'tomada' | 'regreso';
  solicitudId: string;
  nombreCliente: string;
  nombreEmbarcacion: string;
  operadorNombre?: string;
  operadorEmail?: string;
  createdAt: number | null;
};

const TIPO_LABEL: Record<string, string> = {
  solicitud_creada: 'Solicitud creada',
  tomada: 'Tomada (buscar)',
  regreso: 'Regresó',
};

export default function SolicitudesPage() {
  const { profile, isReady } = useUserProfile();
  const { app } = useFirebase();
  const { toast } = useToast();
  const schoolId = profile?.activeSchoolId ?? profile?.memberships?.[0]?.schoolId;
  const [pendientes, setPendientes] = useState<Solicitud[]>([]);
  const [sinRegreso, setSinRegreso] = useState<Solicitud[]>([]);
  const [registro, setRegistro] = useState<RegistroItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activo, setActivo] = useState<'pendientes' | 'entregadas' | 'devueltas' | 'registro'>('pendientes');
  const [tomandoId, setTomandoId] = useState<string | null>(null);
  const [regresandoId, setRegresandoId] = useState<string | null>(null);

  // Filtros para la pestaña Registro
  const [fechaDesde, setFechaDesde] = useState<Date | null>(null);
  const [fechaHasta, setFechaHasta] = useState<Date | null>(null);
  const [clienteFilter, setClienteFilter] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('all');

  const devueltas = useMemo(
    () => registro.filter((r) => r.tipo === 'regreso'),
    [registro]
  );

  // Registro filtrado según criterios
  const filteredRegistro = useMemo(() => {
    let items = registro;
    if (fechaDesde) {
      const desde = startOfDay(fechaDesde).getTime();
      items = items.filter((r) => (r.createdAt ?? 0) >= desde);
    }
    if (fechaHasta) {
      const hasta = endOfDay(fechaHasta).getTime();
      items = items.filter((r) => (r.createdAt ?? 0) <= hasta);
    }
    if (clienteFilter.trim()) {
      const q = clienteFilter.trim().toLowerCase();
      items = items.filter((r) =>
        (r.nombreCliente ?? '').toLowerCase().includes(q)
      );
    }
    if (tipoFilter && tipoFilter !== 'all') {
      items = items.filter((r) => r.tipo === tipoFilter);
    }
    return items;
  }, [registro, fechaDesde, fechaHasta, clienteFilter, tipoFilter]);

  // Resumen: salidas (regresos) por cliente en el rango filtrado
  const salidasPorCliente = useMemo(() => {
    const regresos = filteredRegistro.filter((r) => r.tipo === 'regreso');
    const map = new Map<string, number>();
    for (const r of regresos) {
      const key = r.nombreCliente?.trim() || '(sin nombre)';
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([cliente, count]) => ({ cliente, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredRegistro]);

  const totalSalidas = useMemo(
    () => filteredRegistro.filter((r) => r.tipo === 'regreso').length,
    [filteredRegistro]
  );

  const aplicarPreset = useCallback((preset: 'hoy' | 'semana' | 'mes') => {
    const hoy = new Date();
    if (preset === 'hoy') {
      setFechaDesde(hoy);
      setFechaHasta(hoy);
    } else if (preset === 'semana') {
      setFechaDesde(startOfWeek(hoy, { weekStartsOn: 1 }));
      setFechaHasta(endOfWeek(hoy, { weekStartsOn: 1 }));
    } else {
      setFechaDesde(startOfMonth(hoy));
      setFechaHasta(endOfMonth(hoy));
    }
  }, []);

  const fetchWithAuth = useCallback(async (url: string) => {
    const auth = getAuth(app!);
    const user = auth.currentUser;
    if (!user) return null;
    const token = await user.getIdToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }, [app]);

  const loadData = useCallback(async () => {
    if (!schoolId || !app) return;
    setLoading(true);
    setError(null);
    try {
      const [pendRes, salioRes, regRes] = await Promise.all([
        fetchWithAuth(`/api/solicitud-embarcacion?schoolId=${schoolId}&status=pendiente`),
        fetchWithAuth(`/api/solicitud-embarcacion?schoolId=${schoolId}&status=salió`),
        fetchWithAuth(`/api/solicitud-embarcacion/registro?schoolId=${schoolId}&limit=500`),
      ]);
      setPendientes(pendRes?.items ?? []);
      setSinRegreso(salioRes?.items ?? []);
      setRegistro(regRes?.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [schoolId, app, fetchWithAuth]);

  useEffect(() => {
    if (isReady && schoolId) loadData();
  }, [isReady, schoolId, loadData]);

  const handleTomar = async (s: Solicitud) => {
    if (!schoolId || !app) return;
    setTomandoId(s.id);
    try {
      const auth = getAuth(app);
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/solicitud-embarcacion/${s.id}/tomar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ schoolId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Error');
      }
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al tomar');
    } finally {
      setTomandoId(null);
    }
  };

  const handleRegreso = async (s: Solicitud) => {
    if (!schoolId || !app) return;
    setRegresandoId(s.id);
    try {
      const auth = getAuth(app);
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/solicitud-embarcacion/${s.id}/regreso`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ schoolId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Error');
      }
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al marcar regreso');
    } finally {
      setRegresandoId(null);
    }
  };

  if (!isReady || !profile) {
    return <div className="flex items-center justify-center min-h-[60vh]">Cargando...</div>;
  }

  if (!schoolId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-lg text-muted-foreground">Seleccioná una náutica para ver las solicitudes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline">Solicitudes de embarcaciones</h1>
          <p className="text-muted-foreground mt-1">Tomá solicitudes, marcá regresos y consultá el registro.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              if (!schoolId) return;
              const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/solicitud?schoolId=${schoolId}`;
              navigator.clipboard.writeText(url).then(
                () => toast({ title: 'Link copiado', description: 'El link del cliente se copió al portapapeles.' }),
                () => toast({ variant: 'destructive', title: 'Error', description: 'No se pudo copiar el link.' })
              );
            }}
            disabled={!schoolId}
          >
            <Link2 className="h-4 w-4" />
            Generar link del cliente
          </Button>
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <a href="/operador" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              Abrir vista operador
            </a>
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-lg">
          {error}
        </div>
      )}

      <Tabs value={activo} onValueChange={(v) => setActivo(v as typeof activo)}>
        <TabsList className="grid w-full grid-cols-4 h-12 text-sm">
          <TabsTrigger value="pendientes" className="gap-1.5">
            <Ship className="h-4 w-4" />
            Pendientes ({pendientes.length})
          </TabsTrigger>
          <TabsTrigger value="entregadas" className="gap-1.5">
            <ExternalLink className="h-4 w-4" />
            Entregadas ({sinRegreso.length})
          </TabsTrigger>
          <TabsTrigger value="devueltas" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Devueltas ({devueltas.length})
          </TabsTrigger>
          <TabsTrigger value="registro" className="gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            Registro ({registro.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Pedidos pendientes</CardTitle>
              <p className="text-sm text-muted-foreground">
                Solicitudes que esperan que un operador vaya a buscar la embarcación.
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-12 text-center text-muted-foreground">Cargando...</div>
              ) : pendientes.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No hay solicitudes pendientes.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Embarcación</TableHead>
                      <TableHead>Hora</TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendientes.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.nombreCliente}</TableCell>
                        <TableCell>{s.nombreEmbarcacion}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.createdAt ? format(new Date(s.createdAt), 'HH:mm', { locale: es }) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => handleTomar(s)}
                            disabled={tomandoId === s.id}
                          >
                            {tomandoId === s.id ? '...' : 'Tomar'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="entregadas" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Entregadas (sin regreso)</CardTitle>
              <p className="text-sm text-muted-foreground">
                Embarcaciones que salieron y aún no regresaron. Marcá regreso cuando vuelvan.
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-12 text-center text-muted-foreground">Cargando...</div>
              ) : sinRegreso.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No hay embarcaciones entregadas sin regreso.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Embarcación</TableHead>
                      <TableHead>Operador</TableHead>
                      <TableHead>Hora salida</TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sinRegreso.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.nombreCliente}</TableCell>
                        <TableCell>{s.nombreEmbarcacion}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.salioOperadorNombre ?? '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.salioAt ? format(new Date(s.salioAt), 'HH:mm', { locale: es }) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRegreso(s)}
                            disabled={regresandoId === s.id}
                          >
                            {regresandoId === s.id ? '...' : 'Marcar regreso'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devueltas" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Devueltas</CardTitle>
              <p className="text-sm text-muted-foreground">
                Embarcaciones que ya regresaron.
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-12 text-center text-muted-foreground">Cargando...</div>
              ) : devueltas.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No hay embarcaciones devueltas.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Embarcación</TableHead>
                      <TableHead>Operador</TableHead>
                      <TableHead>Hora regreso</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {devueltas.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.nombreCliente}</TableCell>
                        <TableCell>{r.nombreEmbarcacion}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.operadorNombre ?? '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.createdAt ? format(new Date(r.createdAt), 'PPp', { locale: es }) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="registro" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Registro completo</CardTitle>
              <p className="text-sm text-muted-foreground">
                Historial de todos los movimientos: solicitudes creadas, tomadas y regresos. Filtrá por fecha, cliente o tipo.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Filtros */}
              <div className="flex flex-wrap items-end gap-4 p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Filtros</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Desde</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2 min-w-[140px] justify-start">
                          <CalendarIcon className="h-4 w-4" />
                          {fechaDesde ? format(fechaDesde, 'dd/MM/yyyy', { locale: es }) : 'Seleccionar'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={fechaDesde ?? undefined}
                          onSelect={(d) => setFechaDesde(d ?? null)}
                          locale={es}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Hasta</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-2 min-w-[140px] justify-start">
                          <CalendarIcon className="h-4 w-4" />
                          {fechaHasta ? format(fechaHasta, 'dd/MM/yyyy', { locale: es }) : 'Seleccionar'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={fechaHasta ?? undefined}
                          onSelect={(d) => setFechaHasta(d ?? null)}
                          locale={es}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => aplicarPreset('hoy')}>
                      Hoy
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => aplicarPreset('semana')}>
                      Semana
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => aplicarPreset('mes')}>
                      Mes
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cliente</Label>
                    <Input
                      placeholder="Buscar por nombre..."
                      value={clienteFilter}
                      onChange={(e) => setClienteFilter(e.target.value)}
                      className="h-9 w-[180px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={tipoFilter} onValueChange={setTipoFilter}>
                      <SelectTrigger className="h-9 w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="solicitud_creada">Solicitud creada</SelectItem>
                        <SelectItem value="tomada">Tomada</SelectItem>
                        <SelectItem value="regreso">Regresó</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFechaDesde(null);
                      setFechaHasta(null);
                      setClienteFilter('');
                      setTipoFilter('all');
                    }}
                  >
                    Limpiar
                  </Button>
                </div>
              </div>

              {/* Resumen */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Movimientos filtrados</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{filteredRegistro.length}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Salidas completadas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{totalSalidas}</div>
                    <p className="text-xs text-muted-foreground">Regresos en el período</p>
                  </CardContent>
                </Card>
                {salidasPorCliente.length > 0 && (
                  <Card className="sm:col-span-2 lg:col-span-1">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                        <BarChart3 className="h-4 w-4" />
                        Salidas por cliente
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1 max-h-32 overflow-y-auto text-sm">
                        {salidasPorCliente.slice(0, 8).map(({ cliente, count }) => (
                          <div key={cliente} className="flex justify-between">
                            <span className="truncate">{cliente}</span>
                            <span className="font-medium">{count}</span>
                          </div>
                        ))}
                        {salidasPorCliente.length > 8 && (
                          <p className="text-xs text-muted-foreground pt-1">
                            +{salidasPorCliente.length - 8} más
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Tabla */}
              {loading ? (
                <div className="py-12 text-center text-muted-foreground">Cargando...</div>
              ) : filteredRegistro.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  {registro.length === 0
                    ? 'No hay movimientos registrados.'
                    : 'No hay registros que coincidan con los filtros.'}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Embarcación</TableHead>
                      <TableHead>Operador</TableHead>
                      <TableHead>Hora</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRegistro.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Badge variant={r.tipo === 'regreso' ? 'default' : r.tipo === 'tomada' ? 'secondary' : 'outline'}>
                            {TIPO_LABEL[r.tipo] ?? r.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{r.nombreCliente}</TableCell>
                        <TableCell>{r.nombreEmbarcacion}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.operadorNombre ?? '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.createdAt ? format(new Date(r.createdAt), 'PPp', { locale: es }) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
