"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * El registro público es solo para clientes.
 * Los demás roles (admin de náutica, operador) se crean desde el panel
 * por superadmin o admin de la náutica. Redirigimos a /auth/registro.
 */
export default function SignupPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/auth/registro");
  }, [router]);
  return null;
}
