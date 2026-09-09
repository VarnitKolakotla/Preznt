/**
 * Canonical subject master list for PREZNT.
 *
 * Everything that shows or tracks a subject (Records tabs, professor
 * assignment, percentage keys, session system) derives from this list.
 * Non-tracked blocks (Coding Practice, Training Session, Library / Sports,
 * Lunch Break) appear on the timetable but are excluded from attendance.
 */
export interface SubjectMeta {
  code: string;
  name: string;
  courseCode: string;
  faculty: string;
  periodsPerWeek: number;
}

export const SUBJECTS: SubjectMeta[] = [
  { code: "BDA", name: "Big Data Analytics", courseCode: "20CS41001", faculty: "P Usha Shree", periodsPerWeek: 3 },
  { code: "ML", name: "Machine Learning", courseCode: "20CS41002", faculty: "V Sravanthi", periodsPerWeek: 3 },
  { code: "CC", name: "Cloud Computing", courseCode: "20CS41003", faculty: "M Viswa Shanthi", periodsPerWeek: 3 },
  { code: "MAD", name: "Mobile Application Development", courseCode: "20CS41013", faculty: "M Prashanth", periodsPerWeek: 4 },
  { code: "STM", name: "Software Testing Methodologies", courseCode: "20CS41018", faculty: "Bikku Ramavath", periodsPerWeek: 4 },
  { code: "BDA&CC Lab", name: "BDA & CC Lab", courseCode: "20CS41L01", faculty: "P Usha Shree & M Viswa Shanthi", periodsPerWeek: 2 },
  { code: "ML Lab", name: "Machine Learning Lab", courseCode: "20CS41L02", faculty: "V Sravanthi", periodsPerWeek: 2 },
  { code: "Seminar", name: "Project Seminar", courseCode: "20CS41004", faculty: "Dr J Sudhakar & Mr E Mahender", periodsPerWeek: 2 },
];

/** Subject names that count toward attendance. */
export const TRACKED_SUBJECTS: string[] = SUBJECTS.map((s) => s.name);

export function isTracked(subject: string): boolean {
  return TRACKED_SUBJECTS.includes(subject);
}

export function subjectMeta(name: string): SubjectMeta | undefined {
  return SUBJECTS.find((s) => s.name === name);
}

export function shortLabel(name: string): string {
  return subjectMeta(name)?.code ?? name;
}
