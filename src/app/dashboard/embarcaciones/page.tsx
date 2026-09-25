'use client';

import { useState, useMemo } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { useFirestore, useUserProfile, useCollection } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  Plus,
  Search,
  Pencil,
  AlertTriangle,
  FileWarning,
  Ship,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import type { Vessel, VesselType, VesselStatus, Player } from '@/lib/types';
import {
  VESSEL_TYPE_LABELS,
  VESSEL_STATUS_LABELS,
  VESSEL_DOC_TYPE_LABELS,
  getExpiringDocs,
} from '@/lib/types/marina';
import { format, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

const STATUS_BADGE: Record<VesselStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  inactive: 'secondary',
  maintenance: 'destructive',
};

const VESSEL_TYPES: VesselType[] = ['lancha', 'velero', 'catamarán', 'moto_de_agua', 'canobote', 'kayak', 'otro'];

interface VesselFormValues {
  nombre: string;
  matricula: string;
  type: VesselType | '';
  eslora: string;
  manga: string;
  anio: string;
  marca: string;
  motor: string;
  lona: string;
  notes: string;
  status: VesselStatus;
  playerId: string;
  // documentos: simplificado — un ítem por tipo clave
  seguro_vencimiento: string;
  prefectura_vencimiento: string;
}

const EMPTY_FORM: VesselFormValues = {
  nombre: '',
  matricula: '',
  type: '',
  eslora: '',
  manga: '',
  anio: '',
  marca: '',
  motor: '',
  lona: '',
  notes: '',
  status: 'active',
  playerId: '',
  seguro_vencimiento: '',
  prefectura_vencimiento: '',
};

function vesselToForm(v: Vessel): VesselFormValues {
  const seguro = v.documents?.find((d) => d.type === 'seguro');
  const prefectura = v.documents?.find((d) => d.type === 'revision_prefectura');
  return {
    nombre: v.nombre,
    matricula: v.matricula ?? '',
    type: v.type ?? '',
    eslora: v.eslora?.toString() ?? '',
    manga: v.manga?.toString() ?? '',
    anio: v.anio?.toString() ?? '',
    marca: v.marca ?? '',
    motor: v.motor ?? '',
    lona: v.lona ?? '',
    notes: v.notes ?? '',
    status: v.status,
    playerId: v.playerId,
    seguro_vencimiento: seguro?.expiresAt ?? '',
    prefectura_vencimiento: prefectura?.expiresAt ?? '',
  };
}

function DocExpiryBadge({ dateStr }: { dateStr?: string }) {
  if (!dateStr) return <span className="text-muted-foreground text-xs">—</span>;
  const date = parseISO(dateStr);
  const days = differenceInDays(date, new Date());
  const label = format(date, 'dd/MM/yyyy', { locale: es });
  if (days < 0) return <Badge variant="destructive" className="text-xs">{label} (vencido)</Badge>;
  if (days <= 30) return <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800">{label} ({days}d)</Badge>;
  return <span className="text-xs">{label}</span>;
}

export default function EmbarcacionesPage() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { profile, isReady } = useUserProfile();
  const schoolId = profile?.activeSchoolId ?? '';

  const { data: vessels, loading } = useCollection<Vessel>(
    schoolId ? `schools/${schoolId}/vessels` : '',
    { orderBy: ['nombre', 'asc'] }
  );

  const { data: players } = useCollection<Player>(
    schoolId ? `schools/${schoolId}/players` : '',
    { where: ['archived', '!=', true] }
  );

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<VesselStatus | 'all'>('all');
  const [filterType, setFilterType] = useState<VesselType | 'all'>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVessel, setEditingVessel] = useState<Vessel | null>(null);
  const [form, setForm] = useState<VesselFormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const list = vessels ?? [];
    return list.filter((v) => {
      if (filterStatus !== 'all' && v.status !== filterStatus) return false;
      if (filterType !== 'all' && v.type !== filterType) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !v.nombre.toLowerCase().includes(q) &&
          !(v.matricula?.toLowerCase().includes(q)) &&
          !v.playerName.toLowerCase().includes(q) &&
          !(v.marca?.toLowerCase().includes(q))
        ) return false;
      }
      return true;
    });
  }, [vessels, filterStatus, filterType, search]);

  const expiringAlerts = useMemo(() => {
    const list = vessels ?? [];
    return list.flatMap((v) =>
      getExpiringDocs(v).map((d) => ({ vessel: v, doc: d }))
    );
  }, [vessels]);

  const stats = useMemo(() => {
    const list = vessels ?? [];
    return {
      total: list.length,
      active: list.filter((v) => v.status === 'active').length,
      inactive: list.filter((v) => v.status === 'inactive').length,
      maintenance: list.filter((v) => v.status === 'maintenance').length,
      expiring: expiringAlerts.length,
    };
  }, [vessels, expiringAlerts]);

  function openCreate() {
    setEditingVessel(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(v: Vessel) {
    setEditingVessel(v);
    setForm(vesselToForm(v));
    setDialogOpen(true);
  }

  function buildDocuments(f: VesselFormValues) {
    const docs = [];
    if (f.seguro_vencimiento) {
      docs.push({
        id: 'seguro',
        type: 'seguro',
        name: 'Seguro',
        expiresAt: f.seguro_vencimiento,
      });
    }
    if (f.prefectura_vencimiento) {
      docs.push({
        id: 'revision_prefectura',
        type: 'revision_prefectura',
        name: 'Revisión Prefectura',
        expiresAt: f.prefectura_vencimiento,
      });
    }
    return docs;
  }

  async function handleSave() {
    if (!form.nombre.trim() || !form.playerId || !schoolId) return;
    setSaving(true);
    try {
      const player = players?.find((p) => p.id === form.playerId);
      const playerName = player
        ? `${player.firstName} ${player.lastName}`
        : (editingVessel?.playerName ?? '');

      const payload = {
        nombre: form.nombre.trim(),
        matricula: form.matricula.trim() || null,
        type: form.type || null,
        eslora: form.eslora ? parseFloat(form.eslora) : null,
        manga: form.manga ? parseFloat(form.manga) : null,
        anio: form.anio ? parseInt(form.anio) : null,
        marca: form.marca.trim() || null,
        motor: form.motor.trim() || null,
        lona: form.lona.trim() || null,
        notes: form.notes.trim() || null,
        status: form.status,
        playerId: form.playerId,
        playerName,
        schoolId,
        documents: buildDocuments(form),
        updatedAt: serverTimestamp(),
      };

      if (editingVessel) {
        await updateDoc(doc(firestore, `schools/${schoolId}/vessels/${editingVessel.id}`), payload);
        toast({ title: 'Embarcación actualizada' });
      } else {
        await addDoc(collection(firestore, `schools/${schoolId}/vessels`), {
          ...payload,
          berthId: null,
          berthCode: null,
          createdAt: serverTimestamp(),
          createdBy: profile?.uid ?? '',
        });
        toast({ title: 'Embarcación creada' });
      }
      setDialogOpen(false);
    } catch {
      toast({ title: 'Error al guardar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  if (!isReady) return null;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-headline">Embarcaciones</h1>
          <p className="text-sm text-muted-foreground">Registro de embarcaciones, documentación y vencimientos</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Nueva embarcación
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-foreground' },
          { label: 'Activas', value: stats.active, color: 'text-green-600' },
          { label: 'Mantenimiento', value: stats.maintenance, color: 'text-red-500' },
          { label: 'Docs por vencer', value: stats.expiring, color: stats.expiring > 0 ? 'text-amber-600' : 'text-foreground' },
        ].map((s) => (
          <Card key={s.label} className="py-3">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-3xl font-bold font-headline ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alertas de vencimientos */}
      {expiringAlerts.length > 0 && (
        <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-300">
            <strong>{expiringAlerts.length} documento{expiringAlerts.length > 1 ? 's' : ''} vencido{expiringAlerts.length > 1 ? 's' : ''} o por vencer:</strong>{' '}
            {expiringAlerts.slice(0, 4).map((a, i) => (
              <span key={i}>
                {i > 0 && ', '}
                <strong>{a.vessel.nombre}</strong> — {VESSEL_DOC_TYPE_LABELS[a.doc.type]}
                {a.doc.expiresAt && ` (${format(parseISO(a.doc.expiresAt), 'dd/MM', { locale: es })})`}
              </span>
            ))}
            {expiringAlerts.length > 4 && ` y ${expiringAlerts.length - 4} más`}.
          </AlertDescription>
        </Alert>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 w-52"
            placeholder="Buscar embarcación..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as VesselStatus | 'all')}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {(Object.entries(VESSEL_STATUS_LABELS) as [VesselStatus, string][]).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as VesselType | 'all')}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {VESSEL_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{VESSEL_TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground p-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando embarcaciones...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Socio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Seguro</TableHead>
                  <TableHead>Prefectura</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Ship className="h-8 w-8 opacity-30" />
                        <p>No hay embarcaciones que coincidan.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((v) => {
                  const seguro = v.documents?.find((d) => d.type === 'seguro');
                  const prefectura = v.documents?.find((d) => d.type === 'revision_prefectura');
                  const expDocs = getExpiringDocs(v);
                  return (
                    <TableRow key={v.id} className={expDocs.length > 0 ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}>
                      <TableCell className="font-medium flex items-center gap-1.5">
                        {expDocs.length > 0 && <FileWarning className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
                        {v.nombre}
                        {v.marca && <span className="text-xs text-muted-foreground">{v.marca}</span>}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{v.matricula ?? '—'}</TableCell>
                      <TableCell className="text-sm">{v.type ? VESSEL_TYPE_LABELS[v.type] : '—'}</TableCell>
                      <TableCell className="text-sm">
                        {players?.find((p) => p.id === v.playerId) ? (
                          <Link
                            href={`/dashboard/players/${v.playerId}?schoolId=${schoolId}`}
                            className="text-primary hover:underline flex items-center gap-0.5"
                          >
                            {v.playerName}
                            <ExternalLink className="h-3 w-3 opacity-60" />
                          </Link>
                        ) : (
                          <span>{v.playerName}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE[v.status]}>{VESSEL_STATUS_LABELS[v.status]}</Badge>
                      </TableCell>
                      <TableCell><DocExpiryBadge dateStr={seguro?.expiresAt} /></TableCell>
                      <TableCell><DocExpiryBadge dateStr={prefectura?.expiresAt} /></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(v)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog crear/editar embarcación */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVessel ? 'Editar embarcación' : 'Nueva embarcación'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {/* Socio */}
            <div className="space-y-1.5">
              <Label htmlFor="v-player">Socio *</Label>
              <Select value={form.playerId} onValueChange={(v) => setForm((f) => ({ ...f, playerId: v }))}>
                <SelectTrigger id="v-player">
                  <SelectValue placeholder="Seleccionar socio..." />
                </SelectTrigger>
                <SelectContent>
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

            {/* Nombre y tipo */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="v-nombre">Nombre *</Label>
                <Input
                  id="v-nombre"
                  placeholder="Ej: La Paloma"
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-type">Tipo</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as VesselType }))}>
                  <SelectTrigger id="v-type"><SelectValue placeholder="Tipo..." /></SelectTrigger>
                  <SelectContent>
                    {VESSEL_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{VESSEL_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Matrícula y marca */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="v-mat">Matrícula</Label>
                <Input
                  id="v-mat"
                  placeholder="Ej: ARG-1234-LT"
                  value={form.matricula}
                  onChange={(e) => setForm((f) => ({ ...f, matricula: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-marca">Marca / Modelo</Label>
                <Input
                  id="v-marca"
                  placeholder="Ej: Triton 500"
                  value={form.marca}
                  onChange={(e) => setForm((f) => ({ ...f, marca: e.target.value }))}
                />
              </div>
            </div>

            {/* Medidas */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="v-eslora">Eslora (m)</Label>
                <Input
                  id="v-eslora"
                  type="number"
                  step="0.1"
                  placeholder="Ej: 6.5"
                  value={form.eslora}
                  onChange={(e) => setForm((f) => ({ ...f, eslora: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-manga">Manga (m)</Label>
                <Input
                  id="v-manga"
                  type="number"
                  step="0.1"
                  placeholder="Ej: 2.4"
                  value={form.manga}
                  onChange={(e) => setForm((f) => ({ ...f, manga: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-anio">Año</Label>
                <Input
                  id="v-anio"
                  type="number"
                  placeholder="2018"
                  value={form.anio}
                  onChange={(e) => setForm((f) => ({ ...f, anio: e.target.value }))}
                />
              </div>
            </div>

            {/* Motor */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="v-motor">Motor</Label>
                <Input
                  id="v-motor"
                  placeholder="Ej: Yamaha 90HP"
                  value={form.motor}
                  onChange={(e) => setForm((f) => ({ ...f, motor: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-status">Estado</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as VesselStatus }))}>
                  <SelectTrigger id="v-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(VESSEL_STATUS_LABELS) as [VesselStatus, string][]).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Vencimientos de documentos */}
            <div className="border rounded-md p-3 space-y-3">
              <p className="text-sm font-medium">Vencimientos de documentación</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="v-seguro">Seguro vence</Label>
                  <Input
                    id="v-seguro"
                    type="date"
                    value={form.seguro_vencimiento}
                    onChange={(e) => setForm((f) => ({ ...f, seguro_vencimiento: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v-prefectura">Prefectura vence</Label>
                  <Input
                    id="v-prefectura"
                    type="date"
                    value={form.prefectura_vencimiento}
                    onChange={(e) => setForm((f) => ({ ...f, prefectura_vencimiento: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="v-notes">Notas</Label>
              <Textarea
                id="v-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.nombre.trim() || !form.playerId}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
