import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import type { Attendance, Training } from "./types";
import { format } from "date-fns";

/** Obtiene el entrenamiento del día para una escuela */
export async function getTrainingByDate(
  firestore: Firestore,
  schoolId: string,
  dateStr: string
): Promise<Training & { id: string } | null> {
  const trainingsRef = collection(firestore, `schools/${schoolId}/trainings`);
  const q = query(
    trainingsRef,
    where("dateStr", "==", dateStr),
    limit(1)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const docSnap = snapshot.docs[0];
  const data = docSnap.data();
  return {
    id: docSnap.id,
    date: data.date?.toDate?.() ?? new Date(data.date),
    dateStr: data.dateStr,
    createdAt: data.createdAt?.toDate?.() ?? new Date(data.createdAt),
    createdBy: data.createdBy,
  };
}

/** Obtiene la asistencia de todos los jugadores para un entrenamiento */
export async function getAttendanceForTraining(
  firestore: Firestore,
  schoolId: string,
  trainingId: string
): Promise<Record<string, Attendance["status"]>> {
  const attendanceRef = collection(
    firestore,
    `schools/${schoolId}/trainings/${trainingId}/attendance`
  );
  const snapshot = await getDocs(attendanceRef);
  const result: Record<string, Attendance["status"]> = {};
  snapshot.docs.forEach((d) => {
    const data = d.data();
    result[d.id] = data.status || "presente";
  });
  return result;
}

/** Crea un entrenamiento y guarda la asistencia */
export async function saveAttendance(
  firestore: Firestore,
  schoolId: string,
  date: Date,
  attendanceMap: Record<string, Attendance["status"]>,
  createdBy: string
): Promise<string> {
  const dateStr = format(date, "yyyy-MM-dd");
  const trainingsRef = collection(firestore, `schools/${schoolId}/trainings`);

  const existing = await getTrainingByDate(firestore, schoolId, dateStr);
  let trainingId: string;

  if (existing) {
    trainingId = existing.id;
  } else {
    const newTraining = await addDoc(trainingsRef, {
      date: Timestamp.fromDate(date),
      dateStr,
      createdAt: Timestamp.now(),
      createdBy,
    });
    trainingId = newTraining.id;
  }

  const batch = writeBatch(firestore);
  const trainingDate = new Date(date);
  trainingDate.setHours(0, 0, 0, 0);

  for (const [playerId, status] of Object.entries(attendanceMap)) {
    const attRef = doc(
      firestore,
      `schools/${schoolId}/trainings/${trainingId}/attendance/${playerId}`
    );
    batch.set(attRef, {
      status,
      playerId,
      trainingId,
      trainingDate: Timestamp.fromDate(trainingDate),
    });
  }

  await batch.commit();
  return trainingId;
}

/** Historial de asistencia de un jugador (sin collectionGroup, evita índices compuestos) */
export async function getAttendanceHistoryForPlayer(
  firestore: Firestore,
  schoolId: string,
  playerId: string,
  limitCount = 50
): Promise<Array<{ date: Date; status: Attendance["status"] }>> {
  const trainingsRef = collection(firestore, `schools/${schoolId}/trainings`);
  const q = query(
    trainingsRef,
    orderBy("date", "desc"),
    limit(limitCount)
  );
  const trainingsSnap = await getDocs(q);
  const result: Array<{ date: Date; status: Attendance["status"] }> = [];

  for (const tDoc of trainingsSnap.docs) {
    const attRef = doc(
      firestore,
      `schools/${schoolId}/trainings/${tDoc.id}/attendance/${playerId}`
    );
    const attSnap = await getDoc(attRef);
    if (attSnap.exists()) {
      const data = attSnap.data();
      const trainingData = tDoc.data();
      const date =
        data?.trainingDate?.toDate?.() ??
        trainingData?.date?.toDate?.() ??
        new Date(trainingData?.date ?? 0);
      result.push({
        date,
        status: (data?.status || "presente") as Attendance["status"],
      });
    }
  }

  return result.sort((a, b) => b.date.getTime() - a.date.getTime());
}
