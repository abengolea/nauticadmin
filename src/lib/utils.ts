import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

/** Edad que cumple (o cumplió) en el año en curso. Usada para categorías Sub-X / U-X. */
export function getCategoryAge(birthDate: Date): number {
  const bd = birthDate instanceof Date ? birthDate : new Date(birthDate);
  return new Date().getFullYear() - bd.getFullYear();
}

/** Indica si la fecha de nacimiento corresponde al día de hoy (mes y día). */
export function isBirthdayToday(birthDate: Date | undefined | null): boolean {
  if (!birthDate) return false;
  const bd = birthDate instanceof Date ? birthDate : new Date(birthDate);
  const today = new Date();
  return bd.getMonth() === today.getMonth() && bd.getDate() === today.getDate();
}

/** Edad en meses desde la fecha de nacimiento hasta una fecha de referencia. */
export function getAgeInMonths(birthDate: Date, referenceDate?: Date): number {
  const bd = birthDate instanceof Date ? birthDate : new Date(birthDate);
  const ref = referenceDate ? (referenceDate instanceof Date ? referenceDate : new Date(referenceDate)) : new Date();
  let months = (ref.getFullYear() - bd.getFullYear()) * 12;
  months += ref.getMonth() - bd.getMonth();
  if (ref.getDate() < bd.getDate()) months--;
  return Math.max(0, months);
}

/** Calcula el IMC (peso kg / (altura m)²). */
export function calculateIMC(weightKg: number, heightCm: number): number {
  if (heightCm <= 0) return 0;
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}
