'use client';

import { useUserProfile } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function OperadorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, isReady, user } = useUserProfile();
  const router = useRouter();

  useEffect(() => {
    if (!isReady) return;
    if (!user) {
      router.push('/auth/login');
      return;
    }
    if (!profile) {
      router.push('/auth/pending-approval');
      return;
    }
    if (profile.role === 'player') {
      router.push('/dashboard');
      return;
    }
  }, [isReady, user, profile, router]);

  if (!isReady || !profile || profile.role === 'player') {
    return <div className="flex items-center justify-center min-h-screen">Cargando...</div>;
  }

  return (
    <div className="min-h-screen w-full bg-background flex flex-col touch-manipulation overflow-hidden">
      <main className="flex-1 overflow-auto p-4 md:p-6">
        {children}
      </main>
    </div>
  );
}
