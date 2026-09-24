'use client';

import { useUserProfile } from '@/firebase';
import { VendorsTab } from '@/components/expenses/VendorsTab';

export default function ExpenseVendorsPage() {
  const { profile, activeSchoolId } = useUserProfile();
  const schoolId = activeSchoolId || profile?.activeSchoolId || '';

  if (!schoolId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Seleccioná una náutica para ver los proveedores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold font-headline">Proveedores</h1>
        <p className="text-muted-foreground">
          Catálogo de proveedores y cuenta corriente contable de cada uno.
        </p>
      </div>
      <VendorsTab schoolId={schoolId} />
    </div>
  );
}
