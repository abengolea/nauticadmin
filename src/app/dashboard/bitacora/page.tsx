'use client';

import { useState, useMemo } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { useFirestore, useUserProfile, useCollection } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus, Search, Ship, Anchor, BookOpen, CheckCircle2, Clock } from 'lucide-react';
import type { LogbookEntry, Vessel, Player } from '@/lib/types';
import { format, differenceInMinutes, differenceInHours } from 'date-fns';
import { es } from 'date-fns/locale';

function durationLabel(departure: Date, arrival?: Date): string {
  const end = arrival ?? new Date();
  const mins = differenceInMinutes(end, departure);
  if (mins < 60) return `${mins} min`;
  const hrs = differenceInHours(end, departure);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  if (val && typeof val === 'object' && 'toDate' in val) return (val as Timestamp).toDate();
  return new Date(val as string);
}

interface EntryFormValues {
  vesselId: string;
  vesselName: string;
  destino: string;
  tripulacion: string;
  tripulacionNombres: string;
  departureAt: string;
  notes: string;
}

const EMPTY_FORM: EntryFormValues = {
  vesselId: '',
  vesselName: '',
  destino: '',
  tripulacion: '1',
  tripulacionNombres: '',
  departureAt: '',
  notes: '',
};

export default function BitacoraPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { profile, isReady } = useUserProfile();
  const schoolId = profile?.activeSchoolId ?? '';
  const isPlayer = profile?.role === 'player';
  const playerId = profile?.playerId ?? '';
  const isAdmin = !isPlayer;

  const { data: allEntries, loading } = useCollection<LogbookEntry>(
    schoolId ? `schools/${schoolId}/logbook` : '',
    { orderBy: ['departureAt', 'desc'] }
  );

  const { data: vessels } = useCollection<Vessel>(
    schoolId ? `schools/${schoolId}/vessels` : '',
    isPlayer && playerId
      ? { where: ['playerId', '==', playerId] }
      : undefined
  );

  const { data: players } = useCollection<Player>(
    schoolId && isAdmin ? `schools/${schoolId}/players` : '',
    { where: ['archived', '!=', true] }
  );

  const [search, setSearch] = useState('');
  const [tabFilter, setTabFilter] = useState<'all' | 'out' | 'returned'>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<EntryFormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [returnOpen, setReturnOpen] = useState(false);
  const [returningEntry, setReturningEntry] = useState<LogbookEntry | null>(null);
  const [arrivalAt, setArrivalAt] = useState('');
  const [returning, setReturning] = useState(false);

  // Cuando es player, solo ve sus propias entradas
  const entries = useMemo(() => {
    const list = allEntries ?? [];
    const mine = isPlayer ? list.filter((e) => e.playerId === playerId) : list;
    return mine.filter((e) => {
      if (tabFilter === 'out' && e.status !== 'out') return false;
      if (tabFilter === 'returned' && e.status !== 'returned') return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !e.vesselName.toLowerCase().includes(q) &&
          !e.playerName.toLowerCase().includes(q) &&
          !(e.destino?.toLowerCase().includes(q))
        ) return false;
      }
      return true;
    });
  }, [allEntries, isPlayer, playerId, tabFilter, search]);

  const stats = useMemo(() => {
    const list = isPlayer
      ? (allEntries ?? []).filter((e) => e.playerId === playerId)
      : (allEntries ?? []);
    return {
      afuera: list.filter((e) => e.status === 'out').length,
      totalHoy: list.filter((e) => {
        const d = toDate(e.departureAt);
        const hoy = new Date();
        return d.toDateString() === hoy.toDateString();
      }).length,
    };
  }, [allEntries, isPlayer, playerId]);

  function openCreate() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setForm({ ...EMPTY_FORM, departureAt: local });
    setDialogOpen(true);
  }

  function openReturn(e: LogbookEntry) {
    setReturningEntry(e);
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setArrivalAt(local);
    setReturnOpen(true);
  }

  async function handleCreate() {
    if (!form.vesselName.trim() || !schoolId) return;
    setSaving(true);
    try {
      const departure = new Date(form.departureAt);
      await addDoc(collection(firestore, `schools/${schoolId}/logbook`), {
        schoolId,
        playerId: isPlayer ? playerId : profile?.uid ?? '',
        playerName: isPlayer
          ? `${profile?.displayName ?? ''}`
          : players?.find((p) => p.id === form.vesselId)?.firstName ?? form.vesselName,
        vesselId: form.vesselId || null,
        vesselName: form.vesselName.trim(),
        destino: form.destino.trim() || null,
        tripulacion: form.tripulacion ? parseInt(form.tripulacion) : 1,
        tripulacionNombres: form.tripulacionNombres.trim() || null,
        departureAt: Timestamp.fromDate(departure),
        status: 'out',
        notes: form.notes.trim() || null,
        createdAt: serverTimestamp(),
        createdBy: profile?.uid ?? '',
      });
      toast({ title: '¡Buen viaje! Salida registrada.' });
      setDialogOpen(false);
    } catch {
      toast({ title: 'Error al registrar salida', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleReturn() {
    if (!returningEntry || !schoolId) return;
    setReturning(true);
    try {
      const arrival = new Date(arrivalAt);
      await updateDoc(doc(firestore, `schools/${schoolId}/logbook/${returningEntry.id}`), {
        status: 'returned',
        arrivalAt: Timestamp.fromDate(arrival),
      });
      toast({ title: 'Regreso registrado' });
      setReturnOpen(false);
    } catch {
      toast({ title: 'Error al registrar regreso', variant: 'destructive' });
    } finally {
      setReturning(false);
    }
  }

  if (!isReady) return null;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-headline flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            Bitácora
          </h1>
          <p className="text-sm text-muted-foreground">
            {isPlayer ? 'Registrá tus salidas y regresos' : 'Registro de movimientos de embarcaciones'}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Registrar salida
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <Card className={stats.afuera > 0 ? 'border-blue-400/50' : ''}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Afuera ahora</p>
            <p className={`text-3xl font-bold font-headline ${stats.afuera > 0 ? 'text-blue-600' : ''}`}>
              {stats.afuera}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Salidas hoy</p>
            <p className="text-3xl font-bold font-headline">{stats.totalHoy}</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerta embarcaciones afuera */}
      {stats.afuera > 0 && (
        <Alert className="border-blue-400 bg-blue-50 dark:bg-blue-950/30">
          <Ship className="h-4 w-4 text-blue-500" />
          <AlertDescription className="text-blue-800 dark:text-blue-300">
            <strong>{stats.afuera} embarcación{stats.afuera > 1 ? 'es' : ''}</strong> {stats.afuera > 1 ? 'están' : 'está'} actualmente afuera.
            {' '}Hacé clic en <strong>"Registrar regreso"</strong> cuando vuelva.
          </AlertDescription>
        </Alert>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 w-52"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Tabs value={tabFilter} onValueChange={(v) => setTabFilter(v as typeof tabFilter)}>
          <TabsList>
            <TabsTrigger value="all">Todas</TabsTrigger>
            <TabsTrigger value="out" className="gap-1">
              <Ship className="h-3.5 w-3.5" /> Afuera
            </TabsTrigger>
            <TabsTrigger value="returned" className="gap-1">
              <Anchor className="h-3.5 w-3.5" /> Regresaron
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground p-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando bitácora...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Embarcación</TableHead>
                  {isAdmin && <TableHead>Socio</TableHead>}
                  <TableHead>Destino</TableHead>
                  <TableHead>Tripulación</TableHead>
                  <TableHead>Salida</TableHead>
                  <TableHead>Regreso</TableHead>
                  <TableHead>Duración</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <BookOpen className="h-8 w-8 opacity-30" />
                        <p>No hay entradas en la bitácora.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {entries.map((e) => {
                  const dep = toDate(e.departureAt);
                  const arr = e.arrivalAt ? toDate(e.arrivalAt) : undefined;
                  return (
                    <TableRow key={e.id} className={e.status === 'out' ? 'bg-blue-50/30 dark:bg-blue-950/10' : ''}>
                      <TableCell className="font-medium">{e.vesselName}</TableCell>
                      {isAdmin && <TableCell className="text-sm text-muted-foreground">{e.playerName}</TableCell>}
                      <TableCell className="text-sm">{e.destino ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-sm">
                        {e.tripulacion ?? 1}
                        {e.tripulacionNombres && (
                          <span className="text-xs text-muted-foreground ml-1">({e.tripulacionNombres})</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(dep, "dd/MM HH:mm", { locale: es })}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {arr ? format(arr, "dd/MM HH:mm", { locale: es }) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {e.status === 'out'
                          ? <span className="text-blue-600">{durationLabel(dep)}</span>
                          : arr ? durationLabel(dep, arr) : '—'}
                      </TableCell>
                      <TableCell>
                        {e.status === 'out' ? (
                          <Badge className="bg-blue-500 hover:bg-blue-600 text-white gap-1">
                            <Clock className="h-3 w-3" /> Afuera
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-green-700 border-green-400">
                            <CheckCircle2 className="h-3 w-3" /> Regresó
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {e.status === 'out' && (
                          <Button size="sm" variant="outline" onClick={() => openReturn(e)}>
                            <Anchor className="h-3.5 w-3.5 mr-1" />
                            Regreso
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog registrar salida */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ship className="h-5 w-5 text-blue-500" />
              Registrar salida
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Embarcación */}
            <div className="space-y-1.5">
              <Label>Embarcación *</Label>
              {(vessels ?? []).length > 0 ? (
                <Select
                  value={form.vesselId}
                  onValueChange={(v) => {
                    const vessel = vessels?.find((x) => x.id === v);
                    setForm((f) => ({
                      ...f,
                      vesselId: v,
                      vesselName: vessel?.nombre ?? '',
                    }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Seleccionar embarcación..." /></SelectTrigger>
                  <SelectContent>
                    {(vessels ?? []).map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="Nombre de la embarcación"
                  value={form.vesselName}
                  onChange={(e) => setForm((f) => ({ ...f, vesselName: e.target.value }))}
                />
              )}
            </div>

            {/* Admin: seleccionar socio si no es player */}
            {isAdmin && (
              <div className="space-y-1.5">
                <Label>Socio</Label>
                <Select
                  value={form.vesselId}
                  onValueChange={(v) => {
                    const vessel = (vessels ?? []).find((x) => x.id === v);
                    setForm((f) => ({ ...f, vesselId: v, vesselName: vessel?.nombre ?? '' }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Seleccionar embarcación..." /></SelectTrigger>
                  <SelectContent>
                    {(vessels ?? []).map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.nombre} — {v.playerName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lb-destino">Destino</Label>
                <Input
                  id="lb-destino"
                  placeholder="Ej: Canal Vinculación"
                  value={form.destino}
                  onChange={(e) => setForm((f) => ({ ...f, destino: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lb-trip">Personas a bordo</Label>
                <Input
                  id="lb-trip"
                  type="number"
                  min="1"
                  value={form.tripulacion}
                  onChange={(e) => setForm((f) => ({ ...f, tripulacion: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lb-tripnames">Nombres tripulantes (opcional)</Label>
              <Input
                id="lb-tripnames"
                placeholder="Ej: Juan García, María López"
                value={form.tripulacionNombres}
                onChange={(e) => setForm((f) => ({ ...f, tripulacionNombres: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lb-dep">Hora de salida *</Label>
              <Input
                id="lb-dep"
                type="datetime-local"
                value={form.departureAt}
                onChange={(e) => setForm((f) => ({ ...f, departureAt: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lb-notes">Notas</Label>
              <Textarea
                id="lb-notes"
                rows={2}
                placeholder="Plan de navegación, condiciones, etc."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !form.vesselName.trim() || !form.departureAt}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              <Ship className="h-4 w-4 mr-1" />
              Registrar salida
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog registrar regreso */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Anchor className="h-5 w-5 text-green-600" />
              Registrar regreso
            </DialogTitle>
          </DialogHeader>
          {returningEntry && (
            <div className="py-2 space-y-4">
              <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                <p><span className="font-medium">Embarcación:</span> {returningEntry.vesselName}</p>
                <p><span className="font-medium">Salió:</span> {format(toDate(returningEntry.departureAt), "dd/MM HH:mm", { locale: es })}</p>
                <p><span className="font-medium">Tiempo afuera:</span> {durationLabel(toDate(returningEntry.departureAt))}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lb-arr">Hora de regreso</Label>
                <Input
                  id="lb-arr"
                  type="datetime-local"
                  value={arrivalAt}
                  onChange={(e) => setArrivalAt(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(false)}>Cancelar</Button>
            <Button onClick={handleReturn} disabled={returning || !arrivalAt} className="bg-green-600 hover:bg-green-700">
              {returning && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Confirmar regreso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
