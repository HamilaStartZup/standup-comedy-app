export function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type RecurrenceType = 'daily' | 'weekly' | 'monthly';

export interface GenerateRecurringDatesOptions {
  type: RecurrenceType;
  startDate: string;
  endDate: string;
  weeklyDays?: number[];
}

/**
 * Génère un tableau de dates (YYYY-MM-DD) correspondant au motif de récurrence,
 * filtrées à partir d'aujourd'hui.
 */
export function generateRecurringDates({
  type,
  startDate,
  endDate,
  weeklyDays = [],
}: GenerateRecurringDatesOptions): string[] {
  const start = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  if (end < start) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dates: string[] = [];

  if (type === 'daily') {
    const d = new Date(start);
    d.setHours(0, 0, 0, 0);
    while (d <= end) {
      if (d >= today) dates.push(toLocalDateString(d));
      d.setDate(d.getDate() + 1);
    }
  } else if (type === 'weekly') {
    const days = weeklyDays.length > 0 ? weeklyDays : [start.getDay()];
    const d = new Date(start);
    d.setHours(0, 0, 0, 0);
    while (d <= end) {
      if (d >= today && days.includes(d.getDay())) dates.push(toLocalDateString(d));
      d.setDate(d.getDate() + 1);
    }
  } else if (type === 'monthly') {
    const d = new Date(start);
    d.setHours(0, 0, 0, 0);
    const dayOfMonth = d.getDate();
    while (d <= end) {
      if (d >= today) dates.push(toLocalDateString(d));
      d.setMonth(d.getMonth() + 1);
      d.setDate(Math.min(dayOfMonth, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    }
  }

  return dates;
}
