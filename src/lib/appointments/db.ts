import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  getDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import type { Appointment, AppointmentConfig } from "@/lib/types/appointments";
import { generateTimeSlots } from "./utils";

/** Obtiene la configuración de turnos de una náutica */
export async function getAppointmentConfig(
  firestore: Firestore,
  schoolId: string
): Promise<(AppointmentConfig & { id: string }) | null> {
  const ref = doc(firestore, "schools", schoolId, "appointmentConfig", "default");
  const docSnap = await getDoc(ref);
  if (!docSnap.exists()) return null;
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    updatedAt: data.updatedAt?.toDate?.(),
  } as AppointmentConfig & { id: string };
}

/** Lista turnos de una escuela en un rango de fechas */
export async function getAppointmentsByDateRange(
  firestore: Firestore,
  schoolId: string,
  startDate: Date,
  endDate: Date
): Promise<Appointment[]> {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  const startTs = Timestamp.fromDate(start);
  const endTs = Timestamp.fromDate(end);

  const q = query(
    collection(firestore, "schools", schoolId, "appointments"),
    where("startTime", ">=", startTs),
    where("startTime", "<=", endTs)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      startTime: data.startTime?.toDate?.() ?? new Date(data.startTime),
      endTime: data.endTime?.toDate?.() ?? new Date(data.endTime),
      createdAt: data.createdAt?.toDate?.() ?? new Date(data.createdAt),
    } as Appointment;
  });
}

/** Calcula los slots disponibles para una fecha dada */
export async function getAvailableSlots(
  firestore: Firestore,
  schoolId: string,
  config: AppointmentConfig,
  date: Date
): Promise<string[]> {
  const allSlots = generateTimeSlots(
    config.openTime,
    config.closeTime,
    config.slotIntervalMinutes
  );
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const existing = await getAppointmentsByDateRange(firestore, schoolId, dayStart, dayEnd);
  const scheduledOnly = existing.filter((a) => a.status === "scheduled");
  const takenSet = new Set(
    scheduledOnly.map((a) => {
      const d = new Date(a.startTime);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    })
  );

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  return allSlots.filter((slot) => {
    if (takenSet.has(slot)) return false;
    if (isToday) {
      const [h, m] = slot.split(":").map(Number);
      const slotDate = new Date(date);
      slotDate.setHours(h ?? 0, m ?? 0, 0, 0);
      if (slotDate <= now) return false; // No mostrar turnos pasados
    }
    return true;
  });
}

/** Crea un turno */
export async function createAppointment(
  firestore: Firestore,
  schoolId: string,
  playerId: string,
  date: Date,
  timeSlot: string,
  createdBy: string,
  notes?: string,
  durationMinutes?: number
): Promise<string> {
  const [h, m] = timeSlot.split(":").map(Number);
  const startTime = new Date(date);
  startTime.setHours(h ?? 0, m ?? 0, 0, 0);
  const duration = durationMinutes ?? 15;
  const endTime = new Date(startTime);
  endTime.setMinutes(endTime.getMinutes() + duration);

  const ref = collection(firestore, "schools", schoolId, "appointments");
  const docRef = await addDoc(ref, {
    schoolId,
    playerId,
    startTime: Timestamp.fromDate(startTime),
    endTime: Timestamp.fromDate(endTime),
    status: "scheduled",
    notes: notes ?? null,
    createdAt: serverTimestamp(),
    createdBy,
  });
  return docRef.id;
}
