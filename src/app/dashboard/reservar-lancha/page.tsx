"use client";

import { useUserProfile, useFirebase } from "@/firebase";
import { getAuth } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { ReservarLanchaView } from "@/components/boats/ReservarLanchaView";

export default function ReservarLanchaPage() {
  const { profile, isReady, isPlayer } = useUserProfile();
  const { app } = useFirebase();
  const router = useRouter();

  const getToken = useCallback(async () => {
    const auth = getAuth(app);
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken();
  }, [app]);

  useEffect(() => {
    if (!isReady) return;
    if (!profile) {
      router.push("/auth/pending-approval");
      return;
    }
    if (!isPlayer) {
      router.push("/dashboard");
    }
  }, [isReady, profile, isPlayer, router]);

  if (!isReady || !profile || !isPlayer) {
    return <div className="p-8">Cargando…</div>;
  }

  return (
    <div className="p-4 md:p-6">
      <ReservarLanchaView getToken={getToken} />
    </div>
  );
}
