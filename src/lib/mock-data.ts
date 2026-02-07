import type { Player, PhysicalTest, Session, Injury, TechnicalEvaluation, TacticalEvaluation } from "@/lib/types";

export const physicalTests: PhysicalTest[] = [
  { id: "t1", testType: "Sprint 10m", date: new Date("2023-08-15"), value: 1.8, unit: "s" },
  { id: "t2", testType: "Sprint 10m", date: new Date("2023-09-15"), value: 1.75, unit: "s" },
  { id: "t3", testType: "Sprint 10m", date: new Date("2023-10-15"), value: 1.72, unit: "s" },
  { id: "t4", testType: "Salto Vertical", date: new Date("2023-08-15"), value: 55, unit: "cm" },
  { id: "t5", testType: "Salto Vertical", date: new Date("2023-09-15"), value: 58, unit: "cm" },
  { id: "t6", testType: "Salto Vertical", date: new Date("2023-10-15"), value: 61, unit: "cm" },
  { id: "t7", testType: "Test Yo-Yo", date: new Date("2023-10-15"), value: 19.5, unit: "level" },
];

export const technicalEvaluations: TechnicalEvaluation[] = [
    { 
        id: "te1", 
        date: new Date("2023-10-01"), 
        scores: { ballControl: 8, passing: 9, dribbling: 8, shooting: 7 },
        observations: "Excelente visión y rango de pase. Necesita trabajar en la finalización bajo presión."
    },
    { 
        id: "te2", 
        date: new Date("2023-11-01"), 
        scores: { ballControl: 9, passing: 9, dribbling: 8, shooting: 8 },
        observations: "Mejoró la precisión en el tiro durante el entrenamiento. Muestra más confianza en situaciones 1v1."
    },
];

export const tacticalEvaluations: TacticalEvaluation[] = [
    { 
        id: "ta1", 
        date: new Date("2023-10-10"), 
        scores: { positioning: 8, decisionMaking: 7, gameReading: 9, defensiveAwareness: 6 },
        observations: "Gran comprensión del juego posicional en ataque. Necesita mejorar el seguimiento defensivo."
    },
    { 
        id: "ta2", 
        date: new Date("2023-11-10"), 
        scores: { positioning: 9, decisionMaking: 8, gameReading: 9, defensiveAwareness: 7 },
        observations: "Muestra una mejor toma de decisiones bajo presión. La contribución defensiva ha mejorado."
    },
];

export const sessions: Session[] = [
    { id: "s1", date: new Date(new Date().setDate(new Date().getDate() + 1)), type: 'entrenamiento', category: "U18" },
    { id: "s2", date: new Date(new Date().setDate(new Date().getDate() + 3)), type: 'partido', category: "U18", opponent: "Equipo Rival" },
];

export const injuries: Injury[] = [
    { id: "i1", bodyPart: "Tobillo derecho", injuryDate: new Date("2023-09-20"), status: "alta", severity: "leve" },
    { id: "i2", bodyPart: "Isquiotibial izquierdo", injuryDate: new Date("2023-11-05"), status: "recuperando", severity: "moderada" },
];
