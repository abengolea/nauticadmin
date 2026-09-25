'use client';

import { useState } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { useFirestore, useCollection } from '@/firebase';
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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Loader2, Plus, Pencil, Ship, AlertTriangle, FileWarning } from 'lucide-react';
import type { Vessel, VesselType, VesselStatus } from '@/lib/types';
import {
  VESSEL_TYPE_LABELS,
  VESSEL_STATUS_LABELS,
  VESSEL_DOC_TYPE_LABELS,
  getExpiringDocs,
} from '@/lib/types/marina';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const VESSEL_TYPES: VesselType[] = ['lancha', 'velero', 'catamarán', 'moto_de_agua', 'canobote', 'kayak', 'otro'];

/** Campos que el cliente puede editar */
interface BasicVesselFields {
  nombre: string;
  matricula: string;
  type: VesselType | '';
  eslora: string;
  manga: string;
  anio: string;
  marca: string;
  motor: string;
  lona: string;
}

/** Campos adicionales solo para admin */
interface AdminVesselFields extends BasicVesselFields {
  status: VesselStatus;
  notes: string;
  seguro_vencimiento: string;
  prefectura_vencimiento: string;
}

type VesselFormValues = AdminVesselFields;

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
  status: 'active',
  notes: '',
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
    status: v.status,
    notes: v.notes ?? '',
    seguro_vencimiento: seguro?.expiresAt ?? '',
    prefectura_vencimiento: prefectura?.expiresAt ?? '',
  };
}

interface Props {
  playerId: string;
  playerName: string;
  schoolId: string;
  /** Si false, el usuario solo ve y edita campos básicos (cliente). Si true, ve además documentos y estado. */
  isAdmin: boolean;
  /** Si true, el usuario solo puede editar sus propias embarcaciones. */
  isOwnProfile: boolean;
}

export function PlayerVesselsSection({ playerId, playerName, schoolId, isAdmin, isOwnProfile }: Props) {
  const firestore = useFirestore();
  const { toast } = useToast();

  const { data: vessels, loading } = useCollection<Vessel>(
    schoolId ? `schools/${schoolId}/vessels` : '',
    { where: ['playerId', '==', playerId] }
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVessel, setEditingVessel] = useState<Vessel | null>(null);
  const [form, setForm] = useState<VesselFormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const canEdit = isAdmin || isOwnProfile;

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
      docs.push({ id: 'seguro', type: 'seguro', name: 'Seguro', expiresAt: f.seguro_vencimiento });
    }
    if (f.prefectura_vencimiento) {
      docs.push({ id: 'revision_prefectura', type: 'revision_prefectura', name: 'Revisión Prefectura', expiresAt: f.prefectura_vencimiento });
    }
    return docs;
  }

  async function handleSave() {
    if (!form.nombre.trim() || !schoolId) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        nombre: form.nombre.trim(),
        matricula: form.matricula.trim() || null,
        type: form.type || null,
        eslora: form.eslora ? parseFloat(form.eslora) : null,
        manga: form.manga ? parseFloat(form.manga) : null,
        anio: form.anio ? parseInt(form.anio) : null,
        marca: form.marca.trim() || null,
        motor: form.motor.trim() || null,
        lona: form.lona.trim() || null,
        documents: buildDocuments(form),
        schoolId,
        playerId,
        playerName,
        updatedAt: serverTimestamp(),
      };
      if (isAdmin) {
        payload.status = form.status;
        payload.notes = form.notes.trim() || null;
      }

      if (editingVessel) {
        await updateDoc(
          doc(firestore, `schools/${schoolId}/vessels/${editingVessel.id}`),
          payload
        );
        toast({ title: 'Embarcación actualizada' });
      } else {
        await addDoc(collection(firestore, `schools/${schoolId}/vessels`), {
          ...payload,
          status: 'active',
          documents: [],
          berthId: null,
          berthCode: null,
          createdAt: serverTimestamp(),
          createdBy: playerId,
        });
        toast({ title: 'Embarcación agregada' });
      }
      setDialogOpen(false);
    } catch {
      toast({ title: 'Error al guardar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const list = vessels ?? [];
  const totalExpiring = list.reduce((acc, v) => acc + getExpiringDocs(v).length, 0);
  // El cliente también ve sus alertas de vencimiento

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="font-headline flex items-center gap-2">
          <Ship className="h-5 w-5" />
          {list.length === 1 ? 'Embarcación' : 'Embarcaciones'}
          {list.length > 0 && (
            <Badge variant="secondary" className="ml-1">{list.length}</Badge>
          )}
          {isAdmin && totalExpiring > 0 && (
            <Badge variant="destructive" className="ml-1 gap-1">
              <AlertTriangle className="h-3 w-3" />
              {totalExpiring} venc.
            </Badge>
          )}
        </CardTitle>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Agregar
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando...
          </div>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-2">
            No hay embarcaciones registradas.
            {canEdit && ' Usá "Agregar" para registrar una.'}
          </p>
        ) : (
          <div className="space-y-3">
            {list.map((v) => {
              const expDocs = getExpiringDocs(v);
              const seguro = v.documents?.find((d) => d.type === 'seguro');
              const prefectura = v.documents?.find((d) => d.type === 'revision_prefectura');
              return (
                <div
                  key={v.id}
                  className={`rounded-md border p-3 space-y-2 ${expDocs.length > 0 ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {expDocs.length > 0 && <FileWarning className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                      <span className="font-semibold">{v.nombre}</span>
                      {v.type && <Badge variant="outline" className="text-xs">{VESSEL_TYPE_LABELS[v.type]}</Badge>}
                      {isAdmin && v.status !== 'active' && (
                        <Badge variant="destructive" className="text-xs">{VESSEL_STATUS_LABELS[v.status]}</Badge>
                      )}
                    </div>
                    {canEdit && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(v)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {v.matricula && <span><span className="font-medium text-foreground">Matrícula:</span> {v.matricula}</span>}
                    {v.marca && <span><span className="font-medium text-foreground">Marca:</span> {v.marca}</span>}
                    {v.eslora && <span><span className="font-medium text-foreground">Eslora:</span> {v.eslora} m</span>}
                    {v.motor && <span><span className="font-medium text-foreground">Motor:</span> {v.motor}</span>}
                    {v.anio && <span><span className="font-medium text-foreground">Año:</span> {v.anio}</span>}
                    {v.lona && <span><span className="font-medium text-foreground">Lona:</span> {v.lona}</span>}
                  </div>
                  {(seguro?.expiresAt || prefectura?.expiresAt) && (
                    <div className="flex flex-wrap gap-3 text-xs pt-1 border-t">
                      {seguro?.expiresAt && (
                        <DocBadge label="Seguro" dateStr={seguro.expiresAt} />
                      )}
                      {prefectura?.expiresAt && (
                        <DocBadge label="Prefectura" dateStr={prefectura.expiresAt} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVessel ? 'Editar embarcación' : 'Nueva embarcación'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pv-nombre">Nombre *</Label>
                <Input
                  id="pv-nombre"
                  placeholder="Ej: La Paloma"
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-type">Tipo</Label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as VesselType }))}>
                  <SelectTrigger id="pv-type"><SelectValue placeholder="Tipo..." /></SelectTrigger>
                  <SelectContent>
                    {VESSEL_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{VESSEL_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pv-mat">Matrícula</Label>
                <Input
                  id="pv-mat"
                  placeholder="Ej: ARG-1234-LT"
                  value={form.matricula}
                  onChange={(e) => setForm((f) => ({ ...f, matricula: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-marca">Marca / Modelo</Label>
                <Input
                  id="pv-marca"
                  placeholder="Ej: Triton 500"
                  value={form.marca}
                  onChange={(e) => setForm((f) => ({ ...f, marca: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pv-eslora">Eslora (m)</Label>
                <Input
                  id="pv-eslora"
                  type="number"
                  step="0.1"
                  placeholder="6.5"
                  value={form.eslora}
                  onChange={(e) => setForm((f) => ({ ...f, eslora: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-manga">Manga (m)</Label>
                <Input
                  id="pv-manga"
                  type="number"
                  step="0.1"
                  placeholder="2.4"
                  value={form.manga}
                  onChange={(e) => setForm((f) => ({ ...f, manga: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-anio">Año</Label>
                <Input
                  id="pv-anio"
                  type="number"
                  placeholder="2018"
                  value={form.anio}
                  onChange={(e) => setForm((f) => ({ ...f, anio: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pv-motor">Motor</Label>
                <Input
                  id="pv-motor"
                  placeholder="Ej: Yamaha 90HP"
                  value={form.motor}
                  onChange={(e) => setForm((f) => ({ ...f, motor: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-lona">Lona / cobertura</Label>
                <Input
                  id="pv-lona"
                  placeholder="Ej: lona azul"
                  value={form.lona}
                  onChange={(e) => setForm((f) => ({ ...f, lona: e.target.value }))}
                />
              </div>
            </div>

            {/* Vencimientos de documentación — todos los usuarios */}
            <div className="border rounded-md p-3 space-y-3">
              <p className="text-sm font-medium">Vencimientos de documentación</p>
              <p className="text-xs text-muted-foreground">
                Cargá las fechas para recibir alertas antes de que venzan.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pv-seguro">Seguro vence</Label>
                  <Input
                    id="pv-seguro"
                    type="date"
                    value={form.seguro_vencimiento}
                    onChange={(e) => setForm((f) => ({ ...f, seguro_vencimiento: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pv-prefectura">Prefectura vence</Label>
                  <Input
                    id="pv-prefectura"
                    type="date"
                    value={form.prefectura_vencimiento}
                    onChange={(e) => setForm((f) => ({ ...f, prefectura_vencimiento: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Solo admin: estado y notas internas */}
            {isAdmin && (
              <div className="border rounded-md p-3 space-y-3 border-dashed">
                <p className="text-sm font-medium text-muted-foreground">Solo admin</p>
                <div className="space-y-1.5">
                  <Label htmlFor="pv-status">Estado</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as VesselStatus }))}>
                    <SelectTrigger id="pv-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(VESSEL_STATUS_LABELS) as [VesselStatus, string][]).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pv-notes">Notas internas</Label>
                  <Textarea
                    id="pv-notes"
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.nombre.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DocBadge({ label, dateStr }: { label: string; dateStr: string }) {
  const date = parseISO(dateStr);
  const now = new Date();
  const expired = date < now;
  const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const formatted = format(date, 'dd/MM/yyyy', { locale: es });
  return (
    <span className={`flex items-center gap-1 ${expired ? 'text-red-600' : diff <= 30 ? 'text-amber-700' : 'text-muted-foreground'}`}>
      {(expired || diff <= 30) && <AlertTriangle className="h-3 w-3" />}
      <span className="font-medium">{label}:</span> {formatted}
      {expired ? ' (vencido)' : diff <= 30 ? ` (${diff}d)` : ''}
    </span>
  );
}
