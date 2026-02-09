"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EvolutionChart } from "@/components/charts/EvolutionChart";
import type { PhysicalAssessment, PhysicalAssessmentConfig } from "@/lib/types";
import { getFieldLabel, type PhysicalAssessmentConfigPartial } from "@/lib/physical-assessments";

interface PhysicalAssessmentEvolutionChartsProps {
  assessments: PhysicalAssessment[];
  physicalConfig?: PhysicalAssessmentConfig | null;
}

function seriesFromAssessments(
  assessments: PhysicalAssessment[],
  getValue: (a: PhysicalAssessment) => number | undefined
): { date: Date; value: number }[] {
  const sorted = [...assessments].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  return sorted
    .map((a) => {
      const value = getValue(a);
      if (value === undefined || value === null || isNaN(value)) return null;
      return {
        date: a.date instanceof Date ? a.date : new Date(a.date),
        value,
      };
    })
    .filter((item): item is { date: Date; value: number } => item != null);
}

const NUMERIC_FIELDS = [
  "altura_cm",
  "peso_kg",
  "imc",
  "sprint_20m_seg",
  "sprint_30m_seg",
  "sprint_10m_seg",
  "sprint_40m_seg",
  "salto_horizontal_cm",
  "salto_vertical_cm",
  "equilibrio_seg",
  "circuito_coordinacion_seg",
  "test_6min_metros",
  "test_agilidad_seg",
  "course_navette_nivel",
  "flexiones_1min",
  "cooper_metros",
  "yo_yo_nivel",
  "plancha_seg",
];

export function PhysicalAssessmentEvolutionCharts({
  assessments,
  physicalConfig,
}: PhysicalAssessmentEvolutionChartsProps) {
  if (!assessments?.length) return null;

  const flatSeries: { key: string; label: string; data: { date: Date; value: number }[] }[] = [];

  const getLabel = (k: string, ageGroup?: string) =>
    getFieldLabel(k, (ageGroup as "5-8" | "9-12" | "13-15" | "16-18") ?? undefined, physicalConfig as PhysicalAssessmentConfigPartial | undefined);

  // Métricas base (altura, peso, IMC)
  for (const key of ["altura_cm", "peso_kg", "imc"]) {
    const data = seriesFromAssessments(assessments, (a) =>
      key === "altura_cm" ? a.altura_cm : key === "peso_kg" ? a.peso_kg : a.imc
    );
    if (data.length >= 2) {
      flatSeries.push({ key, label: getLabel(key), data });
    }
  }

  // Tests numéricos (predefinidos + custom)
  const allNumericKeys = new Set(NUMERIC_FIELDS);
  assessments.forEach((a) => {
    if (a.tests && typeof a.tests === "object") {
      for (const [k, v] of Object.entries(a.tests)) {
        if (typeof v === "number" && !["altura_cm", "peso_kg", "imc"].includes(k)) allNumericKeys.add(k);
      }
    }
  });
  allNumericKeys.forEach((fieldKey) => {
    if (["altura_cm", "peso_kg", "imc"].includes(fieldKey)) return;
    const data = seriesFromAssessments(assessments, (a) => {
      const v = a.tests?.[fieldKey as keyof typeof a.tests];
      return typeof v === "number" ? v : undefined;
    });
    if (data.length >= 2) {
      const ageGroup = assessments[0]?.ageGroup;
      flatSeries.push({
        key: fieldKey,
        label: getLabel(fieldKey, ageGroup),
        data,
      });
    }
  });

  if (flatSeries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Evolución física</CardTitle>
          <CardDescription>
            Cuando haya al menos dos evaluaciones con la misma métrica, aquí aparecerán los gráficos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Añade más evaluaciones físicas para ver la evolución de cada métrica.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline">Evolución física</CardTitle>
        <CardDescription>
          Evolución de las métricas. Se muestran solo las que tienen al menos dos fechas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {flatSeries.map(({ key, label, data }) => (
          <div key={key}>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">{label}</h4>
            <EvolutionChart data={data} dataKey="value" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
