"use client";

import { useFormState, useFormStatus } from "react-dom";
import { BrainCircuit, Loader2, Sparkles } from "lucide-react";

import { getPlayerAnalysis } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

const initialState = {
  analysis: "",
  error: "",
  success: false,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analizando...
        </>
      ) : (
        <>
          <Sparkles className="mr-2 h-4 w-4" />
          Generar Análisis
        </>
      )}
    </Button>
  );
}

export function ComparativeAnalytics({ playerId, escuelaId }: { playerId: string, escuelaId: string }) {
  const [state, formAction] = useFormState(getPlayerAnalysis, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-headline">
          <BrainCircuit className="h-6 w-6 text-primary" />
          Análisis de Rendimiento (IA)
        </CardTitle>
        <CardDescription>
          Compara tendencias de jugadores contra las medianas de la escuela para identificar áreas de mejora.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="playerId" value={playerId} />
          <input type="hidden" name="escuelaId" value={escuelaId} />
          
          <div className="space-y-2">
            <Label htmlFor="testType">Seleccionar Tipo de Prueba</Label>
            <Select name="testType" required>
              <SelectTrigger id="testType">
                <SelectValue placeholder="Selecciona una prueba" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sprint_10m">Sprint 10m</SelectItem>
                <SelectItem value="vertical_jump">Salto Vertical</SelectItem>
                <SelectItem value="yoyo_test">Test Yo-Yo</SelectItem>
                <SelectItem value="illinois_agility">Agilidad Illinois</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <SubmitButton />
        </form>

        {(state.success || state.error) && (
          <div className="mt-6">
            <Label>Análisis Generado por IA</Label>
            <Textarea
              readOnly
              value={state.analysis || state.error}
              className={`mt-2 min-h-[150px] font-mono text-xs ${state.error ? 'border-destructive text-destructive' : ''}`}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
