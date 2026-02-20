import type { AppointmentConfig, DayOfWeek } from "@/lib/types/appointments";

/** Parsea "HH:mm" a minutos desde medianoche */
function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Genera slots de tiempo entre openTime y closeTime con el intervalo dado */
export function generateTimeSlots(
  openTime: string,
  closeTime: string,
  intervalMinutes: number
): string[] {
  const openMin = parseTimeToMinutes(openTime);
  const closeMin = parseTimeToMinutes(closeTime);
  const slots: string[] = [];
  for (let m = openMin; m < closeMin; m += intervalMinutes) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return slots;
}

/** Verifica si un día de la semana está habilitado */
export function isDayEnabled(dayOfWeek: number, enabledDays: DayOfWeek[]): boolean {
  return enabledDays.includes(dayOfWeek as DayOfWeek);
}

/** Obtiene las fechas disponibles para reservar (desde hoy hasta advanceBookingDays) */
export function getAvailableDates(config: AppointmentConfig): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < config.advanceBookingDays; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    if (isDayEnabled(d.getDay(), config.enabledDays)) {
      dates.push(d);
    }
  }
  return dates;
}

/** Formatea fecha para mostrar */
export function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
