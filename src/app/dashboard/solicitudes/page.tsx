'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUserProfile } from '@/firebase';
import { getAuth } from 'firebase/auth';
import { useFirebase } from '@/firebase';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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
  const schoolId = profile?.activeSchoolId ?? profile?.memberships?.[0]?.schoolId;
  const [pendientes, setPendientes] = useState<Solicitud[]>([]);
  const [sinRegreso, setSinRegreso] = useState<Solicitud[]>([]);
  const [registro, setRegistro] = useState<RegistroItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activo, setActivo] = useState<'pendientes' | 'sin_regreso' | 'registro'>('pendientes');
  const [pendienteIndex, setPendienteIndex] = useState(0);
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

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
        fetchWithAuth(`/api/solicitud-embarcacion/registro?schoolId=${schoolId}`),
      ]);
      setPendientes(pendRes?.items ?? []);
      setSinRegreso(salioRes?.items ?? []);
      setRegistro(regRes?.items ?? []);
      setPendienteIndex(0);
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
    }
  };

  const handleRegreso = async (s: Solicitud) => {
    if (!schoolId || !app) return;
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
    }
  };

  const handleSwipe = (dir: 'left' | 'right') => {
    if (dir === 'left') {
      setPendienteIndex((i) => Math.min(i + 1, pendientes.length - 1));
    } else {
      setPendienteIndex((i) => Math.max(i - 1, 0));
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };
  const onTouchEnd = () => {
    const delta = touchStartX.current - touchEndX.current;
    if (Math.abs(delta) > 50) {
      handleSwipe(delta > 0 ? 'left' : 'right');
    }
  };

  const currentPendiente = pendientes[pendienteIndex];

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
        <a
          href="/operador"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg border-2 border-primary bg-primary/10 hover:bg-primary/20 text-primary font-semibold transition-colors"
        >
          Abrir vista operador (pantalla completa)
        </a>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-lg">
          {error}
        </div>
      )}

      <Tabs value={activo} onValueChange={(v) => setActivo(v as typeof activo)}>
        <TabsList className="grid w-full grid-cols-3 h-14 text-lg">
          <TabsTrigger value="pendientes" className="text-base sm:text-lg">
            Pendientes ({pendientes.length})
          </TabsTrigger>
          <TabsTrigger value="sin_regreso" className="text-base sm:text-lg">
            Sin regreso ({sinRegreso.length})
          </TabsTrigger>
          <TabsTrigger value="registro" className="text-base sm:text-lg">
            Registro
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes" className="mt-6">
          {loading ? (
            <div className="flex items-center justify-center min-h-[60vh] text-xl">Cargando...</div>
          ) : pendientes.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
              <p className="text-2xl sm:text-3xl text-muted-foreground text-center">
                No hay solicitudes pendientes
              </p>
              <p className="text-lg text-muted-foreground">Deslizá con la mano para pasar entre solicitudes. Tocá para tomar (ir a buscar).</p>
            </div>
          ) : (
            <div
              className="touch-manipulation select-none"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <div className="flex gap-4 items-center mb-6">
                <button
                  type="button"
                  onClick={() => handleSwipe('right')}
                  disabled={pendienteIndex === 0}
                  className="min-h-[56px] min-w-[56px] rounded-xl border-2 border-input bg-background text-2xl font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/50 active:scale-95 transition-all touch-manipulation"
                >
                  ←
                </button>
                <span className="text-xl font-semibold">
                  {pendienteIndex + 1} / {pendientes.length}
                </span>
                <button
                  type="button"
                  onClick={() => handleSwipe('left')}
                  disabled={pendienteIndex >= pendientes.length - 1}
                  className="min-h-[56px] min-w-[56px] rounded-xl border-2 border-input bg-background text-2xl font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted/50 active:scale-95 transition-all touch-manipulation"
                >
                  →
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleTomar(currentPendiente)}
                className="w-full min-h-[280px] sm:min-h-[320px] rounded-2xl border-4 border-primary bg-primary/20 hover:bg-primary/30 active:scale-[0.98] transition-all touch-manipulation flex flex-col items-center justify-center gap-6 p-8"
              >
                <p className="text-2xl sm:text-3xl text-muted-foreground text-center">
                  Cliente
                </p>
                <p className="text-4xl sm:text-5xl md:text-6xl font-bold font-headline text-primary text-center break-words">
                  {currentPendiente.nombreCliente}
                </p>
                <p className="text-2xl sm:text-3xl text-muted-foreground text-center">
                  Embarcación
                </p>
                <p className="text-4xl sm:text-5xl md:text-6xl font-bold font-headline text-foreground text-center break-words">
                  {currentPendiente.nombreEmbarcacion}
                </p>
                <p className="text-xl sm:text-2xl text-muted-foreground mt-2">
                  Tocá para ir a buscar
                </p>
              </button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="sin_regreso" className="mt-6">
          {loading ? (
            <div className="flex items-center justify-center min-h-[60vh] text-xl">Cargando...</div>
          ) : sinRegreso.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
              <p className="text-2xl sm:text-3xl text-muted-foreground text-center">
                No hay embarcaciones sin regreso
              </p>
              <p className="text-lg text-muted-foreground text-center">
                Al final del día, tocá las que volvieron para marcarlas.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sinRegreso.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleRegreso(s)}
                  className="min-h-[140px] sm:min-h-[160px] rounded-2xl border-4 border-primary bg-primary/10 hover:bg-primary/20 active:scale-[0.98] transition-all touch-manipulation flex flex-col items-center justify-center gap-2 p-6 text-left"
                >
                  <p className="text-2xl sm:text-3xl font-bold font-headline text-primary text-center break-words w-full">
                    {s.nombreEmbarcacion}
                  </p>
                  <p className="text-xl sm:text-2xl text-muted-foreground text-center break-words w-full">
                    {s.nombreCliente}
                  </p>
                  <p className="text-base sm:text-lg text-muted-foreground mt-2">
                    Tocá para marcar regreso
                  </p>
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="registro" className="mt-6">
          {loading ? (
            <div className="flex items-center justify-center min-h-[60vh] text-xl">Cargando...</div>
          ) : registro.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
              <p className="text-2xl sm:text-3xl text-muted-foreground text-center">
                No hay movimientos registrados
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[70vh] overflow-y-auto">
              {registro.map((r) => (
                <div
                  key={r.id}
                  className="p-4 sm:p-6 rounded-xl border-2 border-border bg-card flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
                >
                  <span className="text-lg sm:text-xl font-semibold">
                    {TIPO_LABEL[r.tipo] ?? r.tipo}
                  </span>
                  <span className="text-xl sm:text-2xl font-bold font-headline text-primary">
                    {r.nombreEmbarcacion}
                  </span>
                  <span className="text-lg sm:text-xl text-muted-foreground">
                    {r.nombreCliente}
                  </span>
                  {r.operadorNombre && (
                    <span className="text-base sm:text-lg text-muted-foreground">
                      {r.operadorNombre}
                    </span>
                  )}
                  <span className="text-base sm:text-lg text-muted-foreground ml-auto">
                    {r.createdAt ? format(new Date(r.createdAt), "PPp", { locale: es }) : '-'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
