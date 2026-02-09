import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { PhysicalAssessment } from "@/lib/types";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { PHYSICAL_FIELD_LABELS } from "./physical-assessments";

export function exportPhysicalAssessmentPDF(
  playerName: string,
  assessments: PhysicalAssessment[],
  interpretiveReport?: string
): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Header
  doc.setFontSize(18);
  doc.text("Informe de Evaluaciones Físicas", 14, 20);
  doc.setFontSize(12);
  doc.text(`Jugador: ${playerName}`, 14, 28);
  doc.text(`Generado: ${format(new Date(), "PPP", { locale: es })}`, 14, 34);

  let y = 44;

  // Tabla resumen por evaluación
  const headers = ["Fecha", "Edad (meses)", "Altura (cm)", "Peso (kg)", "IMC"];
  const rows = assessments.map((a) => [
    format(a.date instanceof Date ? a.date : new Date(a.date), "dd/MM/yyyy", { locale: es }),
    String(a.edad_en_meses),
    String(a.altura_cm),
    String(a.peso_kg),
    String(a.imc),
  ]);

  autoTable(doc, {
    startY: y,
    head: [headers],
    body: rows,
    theme: "striped",
    headStyles: { fillColor: [41, 128, 185] },
  });

  y = ((doc as unknown) as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Detalle de tests por evaluación
  for (const a of assessments) {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(11);
    doc.text(
      `Evaluación del ${format(a.date instanceof Date ? a.date : new Date(a.date), "PPP", { locale: es })} - Grupo ${a.ageGroup} años`,
      14,
      y
    );
    y += 6;

    const tests = a.tests ? Object.entries(a.tests) : [];
    if (tests.length > 0) {
      const testHeaders = ["Test", "Valor"];
      const testRows = tests.map(([key, val]) => [
        PHYSICAL_FIELD_LABELS[key] || key,
        typeof val === "number" ? String(val) : String(val ?? "—"),
      ]);
      autoTable(doc, {
        startY: y,
        head: [testHeaders],
        body: testRows,
        theme: "plain",
        headStyles: { fillColor: [236, 240, 241] },
      });
      y = ((doc as unknown) as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }
    if (a.observaciones_generales) {
      doc.setFontSize(9);
      doc.text("Observaciones: " + a.observaciones_generales, 14, y, { maxWidth: 180 });
      y += 10;
    }
    y += 4;
  }

  // Informe interpretativo de IA (si existe)
  if (interpretiveReport && interpretiveReport.trim()) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(12);
    doc.text("Informe interpretativo (IA)", 14, y);
    y += 8;
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(
      interpretiveReport.replace(/\*\*/g, "").replace(/^#+\s*/gm, "").trim(),
      180
    );
    doc.text(lines, 14, y);
  }

  doc.save(`Evaluaciones-Fisicas-${playerName.replace(/\s+/g, "-")}.pdf`);
}
