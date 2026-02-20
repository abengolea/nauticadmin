'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { VendorAccountEntry } from '@/lib/expenses/types';

export default function VendorAccountPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const vendorId = params.vendorId as string;
  const schoolId = searchParams.get('schoolId') ?? '';

  const [entries, setEntries] = useState<VendorAccountEntry[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!schoolId || !vendorId) return;
    const user = getAuth().currentUser;
    if (!user) return;

    const load = async () => {
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch(
          `/api/expenses/vendor-accounts/${vendorId}?schoolId=${schoolId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setEntries(data.entries ?? []);
          setBalance(data.balance ?? 0);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [schoolId, vendorId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dashboard/expenses?schoolId=${schoolId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Cuenta corriente</h1>
          <p className="text-muted-foreground">Proveedor: {vendorId}</p>
        </div>
      </div>

      <div className="rounded-lg border p-4 bg-muted/30">
        <p className="text-sm text-muted-foreground">Saldo actual</p>
        <p className="text-2xl font-bold">
          ARS {balance.toLocaleString('es-AR')}
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Cargando...</p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left font-medium">Fecha</th>
                <th className="p-3 text-left font-medium">Tipo</th>
                <th className="p-3 text-left font-medium">Descripción</th>
                <th className="p-3 text-right font-medium">Debe</th>
                <th className="p-3 text-right font-medium">Haber</th>
                <th className="p-3 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b hover:bg-muted/30">
                  <td className="p-3">
                    {format(new Date(e.date), 'dd/MM/yyyy', { locale: es })}
                  </td>
                  <td className="p-3">{e.type}</td>
                  <td className="p-3">{e.description}</td>
                  <td className="p-3 text-right">
                    {e.debit > 0 ? e.debit.toLocaleString('es-AR') : '-'}
                  </td>
                  <td className="p-3 text-right">
                    {e.credit > 0 ? e.credit.toLocaleString('es-AR') : '-'}
                  </td>
                  <td className="p-3 text-right font-medium">
                    {(e.balanceAfter ?? 0).toLocaleString('es-AR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
