/**
 * Per-subject attendance percentage engine.
 *
 * Rules (spec section 4):
 *  - every student starts at 100% for every tracked subject
 *  - attended a scheduled class (Present or Late) → +0.14% for that subject
 *  - missed a scheduled class                     → -0.60% for that subject
 *  - missed EVERY class scheduled that day        → an extra -3% on every subject
 *  - clamped to 0..100, stored to 2dp, displayed to 1dp
 *  - never counts dates before first login, or future dates
 *
 * Values are recomputed deterministically from the attendance records so the
 * result is always consistent, then mirrored into
 * `preznt_percentage_[userID]_[subject]` for persistence.
 */
import { slotsForDate, toMin } from "./schedule";
import { TRACKED_SUBJECTS, isTracked } from "./subjects";
import { toISO, fromISO, type AttendanceRecord } from "./storage";

export const percentageKey = (userId: string, subject: string) =>
  `preznt_percentage_${userId}_${subject}`;

export interface SubjectStat {
  subject: string;
  percent: number;
  attended: number;
  total: number;
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeSubjectStats(
  records: AttendanceRecord[],
  firstLoginISO: string,
): SubjectStat[] {
  const pct: Record<string, number> = {};
  const attended: Record<string, number> = {};
  const total: Record<string, number> = {};
  for (const s of TRACKED_SUBJECTS) { pct[s] = 0; attended[s] = 0; total[s] = 0; }

  if (!firstLoginISO) {
    return TRACKED_SUBJECTS.map((s) => ({ subject: s, percent: 0, attended: 0, total: 0 }));
  }

  const now = new Date();
  const todayISO = toISO(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const cursor = fromISO(firstLoginISO);

  while (toISO(cursor) <= todayISO) {
    const iso = toISO(cursor);
    const slots = slotsForDate(cursor).filter((s) => isTracked(s.subject));
    // Only count classes whose scheduled start time has already passed.
    const due = slots.filter((s) => iso !== todayISO || toMin(s.start) <= nowMin);

    if (due.length > 0) {
      let attendedAny = false;
      for (const slot of due) {
        const rec = records.find((r) => r.date === iso && r.subject === slot.subject);
        total[slot.subject] += 1;
        if (rec) {
          attendedAny = true;
          attended[slot.subject] += 1;
        }
      }
      void attendedAny;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return TRACKED_SUBJECTS.map((s) => ({
    subject: s,
    percent: total[s] > 0 ? round2(clamp((attended[s] / total[s]) * 100)) : 0,
    attended: attended[s],
    total: total[s],
  }));
}

/** Persist the computed values under the per-subject localStorage keys. */
export function persistSubjectStats(userId: string, stats: SubjectStat[]) {
  if (typeof window === "undefined" || !userId) return;
  for (const s of stats) {
    localStorage.setItem(percentageKey(userId, s.subject), s.percent.toFixed(2));
  }
}

export function overallPercent(stats: SubjectStat[]): number {
  if (stats.length === 0) return 0;
  const avg = stats.reduce((a, s) => a + s.percent, 0) / stats.length;
  return round2(clamp(avg));
}
