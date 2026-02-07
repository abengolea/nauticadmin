export type Player = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: Date;
  category: string; // "U10"
  primaryPosition: string; // "Delantero"
  status: "active" | "inactive" | "injured";
  avatarUrl: string;
  height: number;
  weight: number;
};

export type PhysicalTest = {
  id: string;
  testType: string;
  date: Date;
  value: number;
  unit: string;
};

export type TechnicalEvaluation = {
  id: string;
  date: Date;
  scores: {
    ballControl: number;
    passing: number;
    dribbling: number;
    shooting: number;
  };
  observations?: string;
};

export type Session = {
  id: string;
  date: Date;
  type: "training" | "match";
  category: string;
  opponent?: string;
};

export type Injury = {
  id: string;
  bodyPart: string;
  injuryDate: Date;
  status: "active" | "recovering" | "discharged";
  severity: "leve" | "moderada" | "grave";
}
