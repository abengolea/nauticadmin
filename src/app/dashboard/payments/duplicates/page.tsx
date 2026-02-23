"use client";

import { useState, useEffect, useCallback } from "react";
import { useUserProfile, useFirebase } from "@/firebase";
import { getAuth } from "firebase/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { DuplicateCase } from "@/lib/duplicate-payments/types";

interface DuplicateCaseWithAmount extends DuplicateCase {
  totalAmount?: number;
}

export default function DuplicatesPage() {
  const { profile, isReady, isAdmin } = useUserProfile();
  const { app } = useFirebase();
  const router = useRouter();
  const schoolId = profile?.activeSchoolId;
  const [cases, setCases] = useState<DuplicateCaseWithAmount[]>([]);
  const [loading, setLoading] = useState(true);

  const getToken = useCallback(async () => {
    const auth = getAuth(app);
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken();
  }, [app]);

  const fetchCases = useCallback(async () => {
    if (!schoolId) return;
    const token = await getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/duplicate-cases?schoolId=${schoolId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error al cargar");
      const data = await res.json();
      setCases(data.cases ?? []);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, [schoolId, getToken]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  useEffect(() => {
    if (!isReady) return;
    if (!profile) {
      router.push("/auth/pending-approval");
      return;
    }
    if (!isAdmin) {
      router.push("/dashboard");
      return;
    }
  }, [isReady, profile, isAdmin, router]);

  if (!isReady || !profile) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!schoolId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Duplicados detectados</CardTitle>
          <CardDescription>Seleccioná una escuela para ver los casos de duplicado</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          Duplicados detectados
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Casos de pagos potencialmente duplicados que requieren resolución
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Casos abiertos</CardTitle>
          <CardDescription>
            Resolvé cada caso eligiendo: facturar uno y dejar crédito, facturar todos, reembolsar o ignorar
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : cases.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No hay casos de duplicado pendientes
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Cantidad pagos</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.customerId}</TableCell>
                    <TableCell>{c.paymentIds.length}</TableCell>
                    <TableCell>{format(c.createdAt, "d MMM yyyy, HH:mm", { locale: es })}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/dashboard/payments/duplicates/${c.id}?schoolId=${schoolId}`}>
                          Resolver <ChevronRight className="h-4 w-4 ml-1" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
