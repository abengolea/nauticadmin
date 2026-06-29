'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAuth } from 'firebase/auth';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Banknote, Loader2, MoreHorizontal, Search, TrendingUp, User, Users } from 'lucide-react';
import type { ExpenseVendor } from '@/lib/expenses/types';
import { ImportVendorsFromExcel } from './ImportVendorsFromExcel';

export function VendorsTab({ schoolId }: { schoolId: string }) {
  const [vendors, setVendors] = useState<ExpenseVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadVendors = useCallback(async () => {
    const user = getAuth().currentUser;
    if (!user || !schoolId) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ schoolId, limit: '2000' });
      if (search.trim()) params.set('q', search.trim());
      const res = await fetch(`/api/expenses/vendors?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setVendors(data.vendors ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [schoolId, search]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadVendors();
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadVendors, search]);

  const vendorUrl = (vendorId: string, extra?: string) =>
    `/dashboard/expenses/vendor/${vendorId}?schoolId=${schoolId}${extra ? `&${extra}` : ''}`;

  return (
    <div className="flex flex-col gap-4 min-h-[calc(100vh-14rem)]">
      <ImportVendorsFromExcel
        schoolId={schoolId}
        catalogCount={vendors.length}
        onImported={loadVendors}
      />

      <div className="rounded-lg border flex flex-col flex-1 min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b shrink-0 bg-card sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">Catálogo de proveedores</h3>
              <p className="text-sm text-muted-foreground">
                {loading ? 'Cargando…' : `${vendors.length} proveedores · usá ⋮ para cuenta corriente`}
              </p>
            </div>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, CUIT o código…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus={vendors.length > 0}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Cargando proveedores…
          </div>
        ) : vendors.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-12 text-center text-muted-foreground px-4">
            <div>
              <p>No hay proveedores cargados.</p>
              <p className="text-sm mt-1">Expandí la sección de arriba para importar un Excel.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-auto flex-1 min-h-[420px]">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-[1]">
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Razón social</TableHead>
                  <TableHead>CUIT</TableHead>
                  <TableHead className="hidden md:table-cell">Condición IVA</TableHead>
                  <TableHead className="hidden lg:table-cell">Cta. cte.</TableHead>
                  <TableHead className="w-[52px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.slice(0, 500).map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="text-muted-foreground">{v.externalCode ?? '—'}</TableCell>
                    <TableCell className="font-medium max-w-[240px] truncate" title={v.name}>
                      {v.name}
                    </TableCell>
                    <TableCell>{v.cuit ?? '—'}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {v.ivaCondition ?? '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {v.cuentaCorrienteHabilitada !== false ? (
                        <Badge variant="secondary">Sí</Badge>
                      ) : (
                        <Badge variant="outline">No</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Acciones de {v.name}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={vendorUrl(v.id)}>
                              <TrendingUp className="h-4 w-4 mr-2" />
                              Ver cuenta corriente
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={vendorUrl(v.id, 'action=payment')}>
                              <Banknote className="h-4 w-4 mr-2" />
                              Registrar pago
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link href={vendorUrl(v.id)}>
                              <User className="h-4 w-4 mr-2" />
                              Ver ficha del proveedor
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {vendors.length > 500 && (
              <p className="text-xs text-muted-foreground p-3 border-t">
                Mostrando los primeros 500. Usá el buscador para filtrar.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
