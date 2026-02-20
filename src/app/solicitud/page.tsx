'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { NauticAdminLogo } from '@/components/icons/NauticAdminLogo';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

export default function SolicitudPage() {
  const [nombreCliente, setNombreCliente] = useState('');
  const [nombreEmbarcacion, setNombreEmbarcacion] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sugerenciasNombre, setSugerenciasNombre] = useState<string[]>([]);
  const [sugerenciasEmbarcacion, setSugerenciasEmbarcacion] = useState<string[]>([]);
  const [showDropdownNombre, setShowDropdownNombre] = useState(false);
  const [showDropdownEmbarcacion, setShowDropdownEmbarcacion] = useState(false);
  const nombreRef = useRef<HTMLDivElement>(null);
  const embarcacionRef = useRef<HTMLDivElement>(null);

  const debouncedNombre = useDebounce(nombreCliente, 300);
  const debouncedEmbarcacion = useDebounce(nombreEmbarcacion, 300);

  const fetchSugerencias = useCallback(async (tipo: 'nombre' | 'embarcacion', q: string, nombreClienteParam?: string) => {
    if (tipo === 'nombre' && (!q || q.length < 2)) return [];
    if (tipo === 'embarcacion' && !q && !nombreClienteParam) return [];
    const params = new URLSearchParams({ q: q || '', tipo });
    if (tipo === 'embarcacion' && nombreClienteParam) params.set('nombreCliente', nombreClienteParam);
    const res = await fetch(`/api/solicitud-embarcacion/sugerencias?${params}`);
    const data = await res.json();
    return data.sugerencias ?? [];
  }, []);

  useEffect(() => {
    if (debouncedNombre.length >= 2) {
      fetchSugerencias('nombre', debouncedNombre).then(setSugerenciasNombre);
      setShowDropdownNombre(true);
    } else {
      setSugerenciasNombre([]);
      setShowDropdownNombre(false);
    }
  }, [debouncedNombre, fetchSugerencias]);

  useEffect(() => {
    const q = debouncedEmbarcacion.trim();
    const tieneNombre = nombreCliente.trim().length >= 2;
    if (q.length >= 2 || tieneNombre) {
      fetchSugerencias('embarcacion', q, nombreCliente || undefined).then((s) => {
        setSugerenciasEmbarcacion(s);
        setShowDropdownEmbarcacion(s.length > 0);
      });
    } else {
      setSugerenciasEmbarcacion([]);
      setShowDropdownEmbarcacion(false);
    }
  }, [debouncedEmbarcacion, nombreCliente, fetchSugerencias]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (nombreRef.current && !nombreRef.current.contains(e.target as Node)) setShowDropdownNombre(false);
      if (embarcacionRef.current && !embarcacionRef.current.contains(e.target as Node)) setShowDropdownEmbarcacion(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/solicitud-embarcacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombreCliente: nombreCliente.trim(),
          nombreEmbarcacion: nombreEmbarcacion.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Error al enviar. Intentá de nuevo.');
        return;
      }

      setSuccess(true);
      setNombreCliente('');
      setNombreEmbarcacion('');
    } catch {
      setError('Error de conexión. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleNuevaSolicitud = () => {
    setSuccess(false);
    setError(null);
  };

  if (success) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center px-6 py-12 bg-primary/5">
        <div className="max-w-xl w-full text-center space-y-8">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-primary/20 text-primary">
            <svg
              className="w-14 h-14"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold font-headline text-primary mb-4">
              ¡Listo!
            </h1>
            <p className="text-2xl sm:text-3xl md:text-4xl text-foreground leading-tight">
              Tu solicitud fue enviada.
            </p>
            <p className="text-xl sm:text-2xl text-muted-foreground mt-4">
              Un operador buscará tu embarcación.
            </p>
          </div>
          <button
            type="button"
            onClick={handleNuevaSolicitud}
            className="w-full min-h-[72px] sm:min-h-[80px] text-2xl sm:text-3xl font-semibold rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all touch-manipulation"
          >
            Nueva solicitud
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        {/* Logo y título */}
        <div className="flex flex-col items-center gap-4 mb-8 sm:mb-12">
          <NauticAdminLogo className="h-14 w-14 sm:h-16 sm:w-16" />
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold font-headline text-primary text-center">
            Solicitar embarcación
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground text-center">
            Ingresá tu nombre y la embarcación que solicitás
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
          <div className="space-y-3" ref={nombreRef}>
            <label
              htmlFor="nombre"
              className="block text-xl sm:text-2xl font-semibold text-foreground"
            >
              Tu nombre
            </label>
            <div className="relative">
              <input
                id="nombre"
                type="text"
                value={nombreCliente}
                onChange={(e) => setNombreCliente(e.target.value)}
                onFocus={() => sugerenciasNombre.length > 0 && setShowDropdownNombre(true)}
                placeholder="Ej: Juan Pérez"
                autoComplete="off"
                disabled={loading}
                className="w-full min-h-[64px] sm:min-h-[72px] px-5 sm:px-6 text-xl sm:text-2xl md:text-3xl rounded-xl border-2 border-input bg-background focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all touch-manipulation"
              />
              {showDropdownNombre && sugerenciasNombre.length > 0 && (
                <ul className="absolute z-50 w-full mt-1 rounded-xl border-2 border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
                  {sugerenciasNombre.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => {
                          setNombreCliente(s);
                          setShowDropdownNombre(false);
                        }}
                        className="w-full px-5 py-4 text-left text-xl sm:text-2xl hover:bg-muted focus:bg-muted focus:outline-none touch-manipulation"
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="space-y-3" ref={embarcacionRef}>
            <label
              htmlFor="embarcacion"
              className="block text-xl sm:text-2xl font-semibold text-foreground"
            >
              Nombre de la embarcación o matrícula
            </label>
            <div className="relative">
              <input
                id="embarcacion"
                type="text"
                value={nombreEmbarcacion}
                onChange={(e) => setNombreEmbarcacion(e.target.value)}
                onFocus={() => {
                  if (sugerenciasEmbarcacion.length > 0) setShowDropdownEmbarcacion(true);
                  else if (nombreCliente.trim().length >= 2 && nombreEmbarcacion.trim().length < 2) {
                    fetchSugerencias('embarcacion', '', nombreCliente).then((s) => {
                      setSugerenciasEmbarcacion(s);
                      setShowDropdownEmbarcacion(s.length > 0);
                    });
                  }
                }}
                placeholder="Ej: La Gaviota o matrícula"
                autoComplete="off"
                disabled={loading}
                className="w-full min-h-[64px] sm:min-h-[72px] px-5 sm:px-6 text-xl sm:text-2xl md:text-3xl rounded-xl border-2 border-input bg-background focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all touch-manipulation"
              />
              {showDropdownEmbarcacion && sugerenciasEmbarcacion.length > 0 && (
                <ul className="absolute z-50 w-full mt-1 rounded-xl border-2 border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
                  {sugerenciasEmbarcacion.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => {
                          setNombreEmbarcacion(s);
                          setShowDropdownEmbarcacion(false);
                        }}
                        className="w-full px-5 py-4 text-left text-xl sm:text-2xl hover:bg-muted focus:bg-muted focus:outline-none touch-manipulation"
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-destructive/10 text-destructive text-lg sm:text-xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[72px] sm:min-h-[80px] text-2xl sm:text-3xl font-bold rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 transition-all touch-manipulation"
          >
            {loading ? 'Enviando...' : 'Enviar solicitud'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Sin registro. Un operador atenderá tu solicitud.
        </p>
      </div>
    </div>
  );
}
