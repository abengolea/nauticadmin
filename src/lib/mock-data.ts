import type { Player, PhysicalTest, Session, Injury, TechnicalEvaluation, TacticalEvaluation } from "@/lib/types";

export const players: Player[] = [
  {
    id: "1",
    firstName: "Lionel",
    lastName: "Messi",
    birthDate: new Date("1987-06-24"),
    category: "U18",
    primaryPosition: "Forward",
    status: "active",
    avatarUrl: "https://picsum.photos/seed/p1/100/100",
    height: 170,
    weight: 72,
  },
  {
    id: "2",
    firstName: "Julián",
    lastName: "Álvarez",
    birthDate: new Date("2000-01-31"),
    category: "U18",
    primaryPosition: "Forward",
    status: "active",
    avatarUrl: "https://picsum.photos/seed/p2/100/100",
    height: 170,
    weight: 71,
  },
  {
    id: "3",
    firstName: "Emiliano",
    lastName: "Martínez",
    birthDate: new Date("1992-09-02"),
    category: "U18",
    primaryPosition: "Goalkeeper",
    status: "injured",
    avatarUrl: "https://picsum.photos/seed/p3/100/100",
    height: 195,
    weight: 88,
  },
  {
    id: "4",
    firstName: "Enzo",
    lastName: "Fernández",
    birthDate: new Date("2001-01-17"),
    category: "U18",
    primaryPosition: "Midfielder",
    status: "active",
    avatarUrl: "https://picsum.photos/seed/p4/100/100",
    height: 178,
    weight: 77,
  },
];

export const physicalTests: PhysicalTest[] = [
  { id: "t1", testType: "Sprint 10m", date: new Date("2023-08-15"), value: 1.8, unit: "s" },
  { id: "t2", testType: "Sprint 10m", date: new Date("2023-09-15"), value: 1.75, unit: "s" },
  { id: "t3", testType: "Sprint 10m", date: new Date("2023-10-15"), value: 1.72, unit: "s" },
  { id: "t4", testType: "Vertical Jump", date: new Date("2023-08-15"), value: 55, unit: "cm" },
  { id: "t5", testType: "Vertical Jump", date: new Date("2023-09-15"), value: 58, unit: "cm" },
  { id: "t6", testType: "Vertical Jump", date: new Date("2023-10-15"), value: 61, unit: "cm" },
  { id: "t7", testType: "Yo-Yo Test", date: new Date("2023-10-15"), value: 19.5, unit: "level" },
];

export const technicalEvaluations: TechnicalEvaluation[] = [
    { 
        id: "te1", 
        date: new Date("2023-10-01"), 
        scores: { ballControl: 8, passing: 9, dribbling: 8, shooting: 7 },
        observations: "Excellent vision and passing range. Needs to work on finishing under pressure."
    },
    { 
        id: "te2", 
        date: new Date("2023-11-01"), 
        scores: { ballControl: 9, passing: 9, dribbling: 8, shooting: 8 },
        observations: "Improved shooting accuracy in training. Showing more confidence in 1v1 situations."
    },
];

export const tacticalEvaluations: TacticalEvaluation[] = [
    { 
        id: "ta1", 
        date: new Date("2023-10-10"), 
        scores: { positioning: 8, decisionMaking: 7, gameReading: 9, defensiveAwareness: 6 },
        observations: "Strong understanding of positional play in attack. Needs to improve defensive tracking."
    },
    { 
        id: "ta2", 
        date: new Date("2023-11-10"), 
        scores: { positioning: 9, decisionMaking: 8, gameReading: 9, defensiveAwareness: 7 },
        observations: "Shows better decision making under pressure. Defensive contribution has improved."
    },
];

export const sessions: Session[] = [
    { id: "s1", date: new Date(new Date().setDate(new Date().getDate() + 1)), type: 'training', category: "U18" },
    { id: "s2", date: new Date(new Date().setDate(new Date().getDate() + 3)), type: 'match', category: "U18", opponent: "Rival Team" },
];

export const injuries: Injury[] = [
    { id: "i1", bodyPart: "Right ankle", injuryDate: new Date("2023-09-20"), status: "discharged", severity: "leve" },
    { id: "i2", bodyPart: "Left hamstring", injuryDate: new Date("2023-11-05"), status: "recovering", severity: "moderada" },
];

export const getPlayerById = (id: string) => players.find(p => p.id === id);
