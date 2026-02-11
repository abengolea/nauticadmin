"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Banknote, ArrowLeft } from "lucide-react";

/**
 * Página de checkout a la que redirige el stub de pagos.
 * Cuando la integración real con Mercado Pago esté lista, el link de pago
 * llevará a init_point de MP y el alumno no verá esta página.
 */
export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const preference = searchParams.get("preference") ?? "";

  const isStub = preference.startsWith("stub_");

  return (
    <div className="container max-w-lg py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Pago de cuota
          </CardTitle>
          <CardDescription>
            {isStub
              ? "El checkout con Mercado Pago está en desarrollo."
              : "Completá el pago en la ventana que se abrió."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isStub && (
            <p className="text-sm text-muted-foreground">
              Por ahora la escuela puede registrar tu pago manualmente (efectivo, transferencia). Volvé a
              <strong> Pago de cuotas</strong> para ver el estado de tus pagos.
            </p>
          )}
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/dashboard/payments" className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Volver a Pago de cuotas
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
