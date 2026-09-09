// Weekly timetable. Day index: 0=Sun, 1=Mon ... 6=Sat
export interface ClassSlot {
  start: string; // "HH:MM" 24h
  end: string;
  subject: string;
  faculty?: string;
  isBreak?: boolean;
}

// Subjects (from timetable image)
// BDA – Big Data Analytics (P Usha Shree)
// ML  – Machine Learning (V Sravanthi)
// CC  – Cloud Computing (M Viswa Shanthi)
// MAD – Mobile Application Development (M Prashanth)
// STM – Software Testing Methodologies (Bikku Ramavath)
// BDA & CC Lab (P Usha Shree & M Viswa Shanthi)
// ML Lab (V Sravanthi)
// Project Seminar (Dr J Sudhakar & Mr E Mahender)

export const TIMETABLE: Record<number, ClassSlot[]> = {
  1: [ // Monday
    { start: "09:00", end: "09:55", subject: "Mobile Application Development", faculty: "M Prashanth" },
    { start: "09:55", end: "10:50", subject: "Big Data Analytics", faculty: "P Usha Shree" },
    { start: "10:50", end: "11:45", subject: "BDA & CC Lab", faculty: "P Usha Shree & M Viswa Shanthi" },
    { start: "11:45", end: "12:40", subject: "BDA & CC Lab", faculty: "P Usha Shree & M Viswa Shanthi" },
    { start: "12:40", end: "13:30", subject: "Lunch Break", isBreak: true },
    { start: "13:30", end: "14:25", subject: "Coding Practice", faculty: "E Class 2" },
    { start: "14:25", end: "15:20", subject: "Coding Practice", faculty: "E Class 2" },
  ],
  2: [ // Tuesday
    { start: "09:00", end: "09:55", subject: "Cloud Computing", faculty: "M Viswa Shanthi" },
    { start: "09:55", end: "10:50", subject: "Big Data Analytics", faculty: "P Usha Shree" },
    { start: "10:50", end: "11:45", subject: "Mobile Application Development", faculty: "M Prashanth" },
    { start: "11:45", end: "12:40", subject: "Software Testing Methodologies", faculty: "Bikku Ramavath" },
    { start: "12:40", end: "13:30", subject: "Lunch Break", isBreak: true },
    { start: "13:30", end: "14:25", subject: "Machine Learning", faculty: "V Sravanthi" },
    { start: "14:25", end: "15:20", subject: "Library / Sports" },
  ],
  3: [ // Wednesday
    { start: "09:00", end: "09:55", subject: "Machine Learning", faculty: "V Sravanthi" },
    { start: "09:55", end: "10:50", subject: "Cloud Computing", faculty: "M Viswa Shanthi" },
    { start: "10:50", end: "11:45", subject: "Big Data Analytics", faculty: "P Usha Shree" },
    { start: "11:45", end: "12:40", subject: "Software Testing Methodologies", faculty: "Bikku Ramavath" },
    { start: "12:40", end: "13:30", subject: "Lunch Break", isBreak: true },
    { start: "13:30", end: "14:25", subject: "Machine Learning Lab", faculty: "V Sravanthi" },
    { start: "14:25", end: "15:20", subject: "Machine Learning Lab", faculty: "V Sravanthi" },
  ],
  4: [ // Thursday
    { start: "09:00", end: "09:55", subject: "Cloud Computing", faculty: "M Viswa Shanthi" },
    { start: "09:55", end: "10:50", subject: "Machine Learning", faculty: "V Sravanthi" },
    { start: "10:50", end: "11:45", subject: "Mobile Application Development", faculty: "M Prashanth" },
    { start: "11:45", end: "12:40", subject: "Software Testing Methodologies", faculty: "Bikku Ramavath" },
    { start: "12:40", end: "13:30", subject: "Lunch Break", isBreak: true },
    { start: "13:30", end: "14:25", subject: "Project Seminar", faculty: "Dr J Sudhakar & Mr E Mahender" },
    { start: "14:25", end: "15:20", subject: "Project Seminar", faculty: "Dr J Sudhakar & Mr E Mahender" },
  ],
  5: [ // Friday
    { start: "09:00", end: "09:55", subject: "Training Session" },
    { start: "09:55", end: "10:50", subject: "Training Session" },
    { start: "10:50", end: "11:45", subject: "Training Session" },
    { start: "11:45", end: "12:40", subject: "Training Session" },
    { start: "12:40", end: "13:30", subject: "Lunch Break", isBreak: true },
    { start: "13:30", end: "14:25", subject: "Training Session" },
    { start: "14:25", end: "15:20", subject: "Training Session" },
  ],
  6: [ // Saturday
    { start: "09:00", end: "09:55", subject: "Training Session" },
    { start: "09:55", end: "10:50", subject: "Training Session" },
    { start: "10:50", end: "11:45", subject: "Training Session" },
    { start: "11:45", end: "12:40", subject: "Training Session" },
    { start: "12:40", end: "13:30", subject: "Lunch Break", isBreak: true },
    { start: "13:30", end: "14:25", subject: "Training Session" },
    { start: "14:25", end: "15:20", subject: "Training Session" },
  ],
  0: [], // Sunday — off
};

export function slotsForDate(d: Date): ClassSlot[] {
  return (TIMETABLE[d.getDay()] ?? []).filter((s) => !s.isBreak);
}

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function currentSlot(now: Date): ClassSlot | null {
  const slots = slotsForDate(now);
  const cur = now.getHours() * 60 + now.getMinutes();
  return (
    slots.find((s) => cur >= toMin(s.start) && cur <= toMin(s.end)) ??
    slots.find((s) => cur < toMin(s.start)) ??
    null
  );
}

export function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function uniqueSubjects(): string[] {
  const set = new Set<string>();
  Object.values(TIMETABLE).forEach((day) =>
    day.forEach((s) => { if (!s.isBreak) set.add(s.subject); }),
  );
  return Array.from(set).sort();
}
