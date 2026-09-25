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
import { Loader2, Plus, Anchor, Search, Pencil, LayoutGrid, List } from 'lucide-react';
import type {
  Berth,
  BerthStatus,
  BerthZone,
  Player,
} from '@/lib/types';
import {
  BERTH_STATUS_LABELS,
  BERTH_ZONE_LABELS,
} from '@/lib/types/marina';

const STATUS_COLORS: Record<BerthStatus, string> = {
  available: '#22c55e',
  occupied: '#3b82f6',
  reserved: '#f59e0b',
  maintenance: '#ef4444',
};

const STATUS_BADGE: Record<BerthStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  available: 'outline',
  occupied: 'default',
  reserved: 'secondary',
  maintenance: 'destructive',
};

const ZONES: BerthZone[] = ['nave_cubierta', 'cunas_exteriores', 'en_el_agua', 'kayaks', 'otro'];

function BerthMapView({ berths }: { berths: Berth[] }) {
  const byDock = useMemo(() => {
    const map: Record<string, Berth[]> = {};
    for (const b of berths) {
      const key = b.dock || 'Sin muelle';
      if (!map[key]) map[key] = [];
      map[key].push(b);
    }
    return map;
  }, [berths]);

  if (berths.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <Anchor className="h-10 w-10 opacity-30" />
        <p>No hay amarras cargadas todavía.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 text-sm">
        {(Object.entries(STATUS_COLORS) as [BerthStatus, string][]).map(([s, color]) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
            {BERTH_STATUS_LABELS[s]}
          </span>
        ))}
      </div>

      {Object.entries(byDock).map(([dock, dockBerths]) => (
        <div key={dock}>
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">{dock}</h3>
          <div className="flex flex-wrap gap-2">
            {dockBerths.map((b) => (
              <div
                key={b.id}
                title={`${b.code}${b.playerName ? ` · ${b.playerName}` : ''}`}
                className="flex flex-col items-center justify-center rounded border text-xs font-bold cursor-default"
                style={{
                  backgroundColor: STATUS_COLORS[b.status] + '22',
                  borderColor: STATUS_COLORS[b.status],
                  color: STATUS_COLORS[b.status],
                  width: 56,
                  height: 48,
                }}
              >
                <span>{b.code}</span>
                {b.playerName && (
                  <span className="text-[9px] font-normal leading-none truncate max-w-[52px]">
                    {b.playerName.split(' ')[0]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface BerthFormValues {
  code: string;
  zone: BerthZone;
  dock: string;
  description: string;
  maxLength: string;
  maxWidth: string;
  notes: string;
  status: BerthStatus;
}

const EMPTY_FORM: BerthFormValues = {
  code: '',
  zone: 'en_el_agua',
  dock: '',
  description: '',
  maxLength: '',
  maxWidth: '',
  notes: '',
  status: 'available',
};

export default function AmarrasPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { profile, isReady } = useUserProfile();
  const schoolId = profile?.activeSchoolId ?? '';

  const { data: berths, loading } = useCollection<Berth>(
    schoolId ? `schools/${schoolId}/berths` : '',
    { orderBy: ['code', 'asc'] }
  );

  const { data: players } = useCollection<Player>(
    schoolId ? `schools/${schoolId}/players` : '',
    { where: ['archived', '!=', true] }
  );

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<BerthStatus | 'all'>('all');
  const [filterZone, setFilterZone] = useState<BerthZone | 'all'>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBerth, setEditingBerth] = useState<Berth | null>(null);
  const [form, setForm] = useState<BerthFormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignBerth, setAssignBerth] = useState<Berth | null>(null);
  const [assignPlayerId, setAssignPlayerId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const filtered = useMemo(() => {
    const list = berths ?? [];
    return list.filter((b) => {
      if (filterStatus !== 'all' && b.status !== filterStatus) return false;
      if (filterZone !== 'all' && b.zone !== filterZone) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !b.code.toLowerCase().includes(q) &&
          !(b.playerName?.toLowerCase().includes(q)) &&
          !(b.dock?.toLowerCase().includes(q))
        ) return false;
      }
      return true;
    });
  }, [berths, filterStatus, filterZone, search]);

  const stats = useMemo(() => {
    const list = berths ?? [];
    return {
      total: list.length,
      available: list.filter((b) => b.status === 'available').length,
      occupied: list.filter((b) => b.status === 'occupied').length,
      reserved: list.filter((b) => b.status === 'reserved').length,
      maintenance: list.filter((b) => b.status === 'maintenance').length,
    };
  }, [berths]);

  function openCreate() {
    setEditingBerth(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(b: Berth) {
    setEditingBerth(b);
    setForm({
      code: b.code,
      zone: b.zone,
      dock: b.dock ?? '',
      description: b.description ?? '',
      maxLength: b.maxLength?.toString() ?? '',
      maxWidth: b.maxWidth?.toString() ?? '',
      notes: b.notes ?? '',
      status: b.status,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.code.trim() || !schoolId) return;
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        zone: form.zone,
        dock: form.dock.trim() || null,
        description: form.description.trim() || null,
        maxLength: form.maxLength ? parseFloat(form.maxLength) : null,
        maxWidth: form.maxWidth ? parseFloat(form.maxWidth) : null,
        notes: form.notes.trim() || null,
        status: form.status,
        schoolId,
        updatedAt: serverTimestamp(),
      };
      if (editingBerth) {
        await updateDoc(doc(firestore, `schools/${schoolId}/berths/${editingBerth.id}`), payload);
        toast({ title: 'Amarra actualizada' });
      } else {
        await addDoc(collection(firestore, `schools/${schoolId}/berths`), {
          ...payload,
          playerId: null,
          playerName: null,
          activeContractId: null,
          createdAt: serverTimestamp(),
        });
        toast({ title: 'Amarra creada' });
      }
      setDialogOpen(false);
    } catch {
      toast({ title: 'Error al guardar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  function openAssign(b: Berth) {
    setAssignBerth(b);
    setAssignPlayerId(b.playerId ?? '');
    setAssignOpen(true);
  }

  async function handleAssign() {
    if (!assignBerth || !schoolId) return;
    setAssigning(true);
    try {
      const player = players?.find((p) => p.id === assignPlayerId) ?? null;
      await updateDoc(doc(firestore, `schools/${schoolId}/berths/${assignBerth.id}`), {
        playerId: player?.id ?? null,
        playerName: player ? `${player.firstName} ${player.lastName}` : null,
        status: player ? 'occupied' : 'available',
        updatedAt: serverTimestamp(),
      });
      toast({ title: player ? `Amarra asignada a ${player.firstName} ${player.lastName}` : 'Amarra desasignada' });
      setAssignOpen(false);
    } catch {
      toast({ title: 'Error al asignar', variant: 'destructive' });
    } finally {
      setAssigning(false);
    }
  }

  if (!isReady) return null;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-headline">Amarras</h1>
          <p className="text-sm text-muted-foreground">Gestión de amarras y asignación a socios</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Nueva amarra
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-foreground' },
          { label: 'Disponibles', value: stats.available, color: 'text-green-600' },
          { label: 'Ocupadas', value: stats.occupied, color: 'text-blue-600' },
          { label: 'Mantenimiento', value: stats.maintenance, color: 'text-red-500' },
        ].map((s) => (
          <Card key={s.label} className="py-3">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-3xl font-bold font-headline ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="map">
        <TabsList>
          <TabsTrigger value="map" className="gap-1"><LayoutGrid className="h-4 w-4" />Mapa</TabsTrigger>
          <TabsTrigger value="list" className="gap-1"><List className="h-4 w-4" />Listado</TabsTrigger>
        </TabsList>

        {/* Filtros comunes */}
        <div className="flex flex-wrap gap-2 mt-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8 w-48"
              placeholder="Buscar amarra..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as BerthStatus | 'all')}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {(Object.entries(BERTH_STATUS_LABELS) as [BerthStatus, string][]).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterZone} onValueChange={(v) => setFilterZone(v as BerthZone | 'all')}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Zona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las zonas</SelectItem>
              {ZONES.map((z) => (
                <SelectItem key={z} value={z}>{BERTH_ZONE_LABELS[z]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="map" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vista de mapa</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-8">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando amarras...
                </div>
              ) : (
                <BerthMapView berths={filtered} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="list" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground p-8">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando amarras...
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Zona</TableHead>
                      <TableHead>Muelle</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Socio asignado</TableHead>
                      <TableHead>Medidas</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No hay amarras que coincidan con los filtros.
                        </TableCell>
                      </TableRow>
                    )}
                    {filtered.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono font-semibold">{b.code}</TableCell>
                        <TableCell className="text-sm">{BERTH_ZONE_LABELS[b.zone]}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{b.dock ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE[b.status]}>
                            {BERTH_STATUS_LABELS[b.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{b.playerName ?? <span className="text-muted-foreground">Libre</span>}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {b.maxLength ? `${b.maxLength}m` : '—'}
                          {b.maxLength && b.maxWidth ? ` × ${b.maxWidth}m` : b.maxWidth ? `× ${b.maxWidth}m` : ''}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openAssign(b)}>
                              <Anchor className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openEdit(b)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
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

      {/* Dialog crear/editar amarra */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBerth ? 'Editar amarra' : 'Nueva amarra'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="b-code">Código *</Label>
                <Input
                  id="b-code"
                  placeholder="Ej: A-12"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-status">Estado</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as BerthStatus }))}>
                  <SelectTrigger id="b-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(BERTH_STATUS_LABELS) as [BerthStatus, string][]).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="b-zone">Zona</Label>
                <Select value={form.zone} onValueChange={(v) => setForm((f) => ({ ...f, zone: v as BerthZone }))}>
                  <SelectTrigger id="b-zone"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ZONES.map((z) => (
                      <SelectItem key={z} value={z}>{BERTH_ZONE_LABELS[z]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-dock">Muelle / Dársena</Label>
                <Input
                  id="b-dock"
                  placeholder="Ej: Muelle Norte"
                  value={form.dock}
                  onChange={(e) => setForm((f) => ({ ...f, dock: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="b-len">Eslora máx. (m)</Label>
                <Input
                  id="b-len"
                  type="number"
                  step="0.1"
                  placeholder="Ej: 8.5"
                  value={form.maxLength}
                  onChange={(e) => setForm((f) => ({ ...f, maxLength: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-wid">Manga máx. (m)</Label>
                <Input
                  id="b-wid"
                  type="number"
                  step="0.1"
                  placeholder="Ej: 3.0"
                  value={form.maxWidth}
                  onChange={(e) => setForm((f) => ({ ...f, maxWidth: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-notes">Notas</Label>
              <Textarea
                id="b-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.code.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog asignar socio */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Asignar amarra {assignBerth?.code}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <Label>Socio</Label>
            <Select value={assignPlayerId} onValueChange={setAssignPlayerId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar socio..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Desasignar —</SelectItem>
                {(players ?? [])
                  .filter((p) => !p.archived)
                  .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.lastName}, {p.firstName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancelar</Button>
            <Button onClick={handleAssign} disabled={assigning}>
              {assigning && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
