"use client";

import { useEffect, useState } from "react";
import { useCollection } from "@/firebase";
import type { School, UserProfile } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "nauticadmin-selected-school";

export function useSelectedSchool(profile: UserProfile | null | undefined) {
  const [selectedSchoolId, setSelectedSchoolIdState] = useState<string | undefined>();

  useEffect(() => {
    if (!profile) {
      setSelectedSchoolIdState(undefined);
      return;
    }

    if (profile.isSuperAdmin) {
      const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      setSelectedSchoolIdState(stored ?? undefined);
      return;
    }

    if (profile.memberships.length > 1) {
      const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      const valid = profile.memberships.some((m) => m.schoolId === stored);
      setSelectedSchoolIdState(valid ? stored! : profile.activeSchoolId);
      return;
    }

    setSelectedSchoolIdState(profile.activeSchoolId);
  }, [profile]);

  const setSelectedSchoolId = (schoolId: string) => {
    setSelectedSchoolIdState(schoolId);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, schoolId);
    }
  };

  return { selectedSchoolId, setSelectedSchoolId };
}

interface SchoolSwitcherProps {
  profile: UserProfile;
  value: string;
  onChange: (schoolId: string) => void;
  className?: string;
}

export function SchoolSwitcher({ profile, value, onChange, className }: SchoolSwitcherProps) {
  const { data: schools, loading } = useCollection<School>("schools", {
    orderBy: ["name", "asc"],
  });

  const membershipIds = profile.memberships.map((m) => m.schoolId);
  const options = profile.isSuperAdmin
    ? (schools ?? []).filter((s) => s.status === "active")
    : (schools ?? []).filter((s) => s.status === "active" && membershipIds.includes(s.id));

  if (!profile.isSuperAdmin && options.length <= 1) {
    const name = options[0]?.name;
    if (!name) return null;
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        Náutica: <span className="font-medium text-foreground">{name}</span>
      </p>
    );
  }

  return (
    <Select value={value} onValueChange={onChange} disabled={loading || options.length === 0}>
      <SelectTrigger className={cn("w-full sm:w-[280px]", className)}>
        <SelectValue placeholder={loading ? "Cargando náuticas…" : "Seleccioná una náutica"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((school) => (
          <SelectItem key={school.id} value={school.id}>
            {school.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
