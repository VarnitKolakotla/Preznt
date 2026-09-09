import { useEffect, useState, useCallback } from "react";
import { slotsForDate, toMin, TIMETABLE } from "./schedule";
import { supabase } from "@/integrations/supabase/client";
import type { Session as AuthSession } from "@supabase/supabase-js";

export type Role = "Student" | "Professor";
export type AttendanceStatus = "Present" | "Late" | "Absent";

export interface User {
  uuid: string;
  name: string;
  email: string;
  role: Role;
  idNumber: string;
  subjects?: string[];
  createdAt: number;
}

export interface AttendanceRecord {
  id: string;
  userUuid: string;
  studentId: string;
  studentName: string;
  subject: string;
  timestamp: number;
  date: string;
  time: string;
  status: "Present" | "Late";
  confidence: number;
  method: "face" | "qr" | "manual";
}

const THEME_KEY = "preznt_theme";
export const faceKey = (id: string) => `preznt_face_${id}`;
export const attendanceKey = (id: string) => `preznt_attendance_${id}`;
export const firstLoginKey = (id: string) => `preznt_firstlogin_${id}`;
const ACTIVE_SESSION_KEY = "preznt_active_session";
const LATE_REQUESTS_KEY = "preznt_late_requests";
const REENROLL_REQUESTS_KEY = "preznt_reenroll_requests";

export interface ProfSession {
  id: string; professorId: string; professorName: string; subject: string;
  classTime: string; startedAt: number; expiresAt: number; lateDeadline: number; isActive: boolean;
}
export interface LateRequest {
  id: string; sessionId: string; studentId: string; studentName: string;
  studentIdNumber?: string;
  subject: string; timestamp: number; faceConfidence: number; status: "pending" | "approved" | "denied";
}
export interface ReenrollRequest {
  id: string; studentId: string; studentName: string; requestedAt: number;
  status: "pending" | "approved" | "denied";
}

export function getActiveSession(): ProfSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as ProfSession;
    if (!s.isActive || Date.now() > s.expiresAt) return null;
    return s;
  } catch { return null; }
}
export function startSession(s: ProfSession) { write(ACTIVE_SESSION_KEY, s); }
export function endSession() { remove(ACTIVE_SESSION_KEY); }
export function getLateRequests(): LateRequest[] { return read<LateRequest[]>(LATE_REQUESTS_KEY, []); }
export function addLateRequest(r: LateRequest) { write(LATE_REQUESTS_KEY, [r, ...getLateRequests()]); }
export function updateLateRequest(id: string, patch: Partial<LateRequest>) {
  write(LATE_REQUESTS_KEY, getLateRequests().map((r) => r.id === id ? { ...r, ...patch } : r));
}
export function getReenrollRequests(): ReenrollRequest[] { return read<ReenrollRequest[]>(REENROLL_REQUESTS_KEY, []); }
export function addReenrollRequest(r: ReenrollRequest) { write(REENROLL_REQUESTS_KEY, [r, ...getReenrollRequests()]); }
export function updateReenrollRequest(id: string, patch: Partial<ReenrollRequest>) {
  write(REENROLL_REQUESTS_KEY, getReenrollRequests().map((r) => r.id === id ? { ...r, ...patch } : r));
}
export function latestReenrollFor(studentId: string): ReenrollRequest | null {
  return getReenrollRequests().find((r) => r.studentId === studentId) ?? null;
}

export function useReactiveStorage(key: string): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const h = (e: Event) => {
      const ce = e as CustomEvent<{ key: string }>;
      if (!ce.detail || ce.detail.key === key) setTick((t) => t + 1);
    };
    window.addEventListener("preznt:storage", h);
    const s = (e: StorageEvent) => { if (!e.key || e.key === key) setTick((t) => t + 1); };
    window.addEventListener("storage", s);
    const poll = setInterval(() => setTick((t) => t + 1), 3000);
    return () => { window.removeEventListener("preznt:storage", h); window.removeEventListener("storage", s); clearInterval(poll); };
  }, [key]);
  return tick;
}

// Accounts are managed entirely by Supabase Auth — nothing is seeded locally.


function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; }
  catch { return fallback; }
}
function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("preznt:storage", { detail: { key } }));
}
function remove(key: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key);
  window.dispatchEvent(new CustomEvent("preznt:storage", { detail: { key } }));
}

export function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function useStored<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => read<T>(key, fallback));
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ key: string }>;
      if (ce.detail?.key === key) setVal(read<T>(key, fallback));
    };
    window.addEventListener("preznt:storage", handler);
    const storage = (e: StorageEvent) => { if (e.key === key) setVal(read<T>(key, fallback)); };
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("preznt:storage", handler);
      window.removeEventListener("storage", storage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [val, (v: T) => write(key, v)];
}

/**
 * Supabase-backed authentication.
 *
 * A single module-level store is shared by every `useAuth()` consumer so that
 * child components never observe a transient `null` user while a second hook
 * instance boots (that race used to crash /records and /scan).
 */
interface AuthState {
  session: AuthSession | null;
  currentUser: User | null;
  loading: boolean;
}

let authState: AuthState = { session: null, currentUser: null, loading: true };
const authListeners = new Set<() => void>();
let authStarted = false;

function setAuthState(patch: Partial<AuthState>) {
  authState = { ...authState, ...patch };
  authListeners.forEach((l) => l());
}

async function loadProfileInto(userId: string, email: string) {
  const [{ data: p }, { data: r }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "professor").maybeSingle(),
  ]);
  if (!p) { setAuthState({ currentUser: null, loading: false }); return; }
  const role: Role = r ? "Professor" : "Student";
  const idNumber = (role === "Professor" ? (p as any).faculty_id : (p as any).student_id) || p.id_number || "";
  const first = p.first_login_date ? toISO(new Date(p.first_login_date)) : toISO(new Date());
  if (typeof window !== "undefined") {
    const fk = firstLoginKey(userId);
    if (!localStorage.getItem(fk)) localStorage.setItem(fk, first);
    // Mirror the account's stored face signature so recognition works on any device.
    const fd = (p as any).face_descriptor as number[] | null | undefined;
    if (fd && fd.length > 0) {
      localStorage.setItem(faceKey(userId), JSON.stringify(fd));
    }
  }
  setAuthState({
    currentUser: {
      uuid: userId,
      name: p.name,
      email: p.email ?? email,
      role,
      idNumber,
      subjects: p.subjects ?? [],
      createdAt: new Date(p.created_at).getTime(),
    },
    loading: false,
  });
}

function startAuth() {
  if (authStarted || typeof window === "undefined") return;
  authStarted = true;
  supabase.auth.onAuthStateChange((_e, s) => {
    setAuthState({ session: s });
    if (!s) setAuthState({ currentUser: null, loading: false });
    else void loadProfileInto(s.user.id, s.user.email ?? "");
  });
  supabase.auth.getSession().then(({ data }) => {
    setAuthState({ session: data.session });
    if (!data.session) setAuthState({ currentUser: null, loading: false });
    else void loadProfileInto(data.session.user.id, data.session.user.email ?? "");
  });
}

export function useAuth() {
  const [, force] = useState(0);
  useEffect(() => {
    startAuth();
    const l = () => force((n) => n + 1);
    authListeners.add(l);
    l();
    return () => { authListeners.delete(l); };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setAuthState({ currentUser: null, session: null, loading: false });
  }, []);

  const updateUser = useCallback(async (patch: { name?: string }) => {
    const s = authState.session;
    if (!s?.user || !patch.name) return;
    await supabase.from("profiles").update({ name: patch.name }).eq("id", s.user.id);
    await loadProfileInto(s.user.id, s.user.email ?? "");
  }, []);

  return { session: authState.session, currentUser: authState.currentUser, loading: authState.loading, logout, updateUser };
}


// ────────────────────────────────────────────────────────────────
// Sign in / sign up
// ────────────────────────────────────────────────────────────────
export const COLLEGE_DOMAIN = "gcet.edu.in";

export interface SignUpInput {
  email: string; password: string; name: string; idNumber: string;
  role: "student" | "professor"; subjects: string[];
}

export async function signUpWithEmail(input: SignUpInput) {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth`,
      data: {
        full_name: input.name,
        id_number: input.idNumber,
        role: input.role,
        subjects: input.subjects,
      },
    },
  });
  if (error) throw error;
  // Accounts are auto-confirmed — sign straight in so the user lands on Home.
  if (!data.session) {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (signInError) throw signInError;
  }
  return data;
}


export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/confirm/i.test(error.message)) {
      throw new Error("Check your inbox to verify your college email before logging in.");
    }
    throw new Error("Invalid email or password");
  }
  return data;
}

// ────────────────────────────────────────────────────────────────
// Global mark log — every Present/Late mark, readable by professors
// ────────────────────────────────────────────────────────────────
export interface MarkLogEntry {
  id: string;
  studentID: string;
  studentName: string;
  studentIdNumber: string;
  subject: string;
  professorID: string;
  professorName: string;
  sessionID: string;
  date: string;
  timeMarked: string;
  status: "Present" | "Late";
  faceConfidence: number;
}
export const MARK_LOG_KEY = "preznt_mark_log";
export function getMarkLog(): MarkLogEntry[] { return read<MarkLogEntry[]>(MARK_LOG_KEY, []); }
export function appendMarkLog(entry: MarkLogEntry) {
  const cur = getMarkLog();
  if (cur.some((e) => e.studentID === entry.studentID && e.date === entry.date && e.subject === entry.subject)) return;
  write(MARK_LOG_KEY, [entry, ...cur]);
}
/** Manual correction: force-add an entry even if one already exists for the day. */
export function upsertMarkLog(entry: MarkLogEntry) {
  const cur = getMarkLog().filter(
    (e) => !(e.studentID === entry.studentID && e.date === entry.date && e.subject === entry.subject),
  );
  write(MARK_LOG_KEY, [entry, ...cur]);
}
export function removeMarkLog(id: string) {
  write(MARK_LOG_KEY, getMarkLog().filter((e) => e.id !== id));
}
export function updateMarkLog(id: string, patch: Partial<MarkLogEntry>) {
  write(MARK_LOG_KEY, getMarkLog().map((e) => (e.id === id ? { ...e, ...patch } : e)));
}



export function getFaceDescriptor(idNumber: string): Float32Array | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(faceKey(idNumber));
  if (!raw) return null;
  try { return new Float32Array(JSON.parse(raw)); } catch { return null; }
}
export function setFaceDescriptor(userId: string, desc: Float32Array) {
  const arr = Array.from(desc);
  localStorage.setItem(faceKey(userId), JSON.stringify(arr));
  window.dispatchEvent(new CustomEvent("preznt:storage", { detail: { key: faceKey(userId) } }));
  // Persist to the account so the same face is reused on every future login/device.
  void supabase.from("profiles").update({ face_descriptor: arr } as never).eq("id", userId);
}

export function hasFaceEnrolled(idNumber: string): boolean {
  return getFaceDescriptor(idNumber) !== null;
}

export function useUserRecords(idNumber: string | undefined) {
  const key = idNumber ? attendanceKey(idNumber) : "__noop";
  const [records, setRecords] = useStored<AttendanceRecord[]>(key, []);
  const addRecord = useCallback((r: AttendanceRecord) => {
    if (!idNumber) return;
    const cur = read<AttendanceRecord[]>(attendanceKey(idNumber), []);
    write(attendanceKey(idNumber), [r, ...cur]);
  }, [idNumber]);
  return { records, setRecords, addRecord };
}

/** Class-wide records, derived from the global mark log (professor view). */
export function getAllStudentRecords(): AttendanceRecord[] {
  if (typeof window === "undefined") return [];
  return getMarkLog().map((e) => ({
    id: e.id,
    userUuid: e.studentID,
    studentId: e.studentIdNumber,
    studentName: e.studentName,
    subject: e.subject,
    timestamp: new Date(`${e.date}T${e.timeMarked}:00`).getTime(),
    date: e.date,
    time: e.timeMarked,
    status: e.status,
    confidence: e.faceConfidence,
    method: "face" as const,
  }));
}


export function getFirstLoginDate(idNumber: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(firstLoginKey(idNumber));
}

export function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function useTheme() {
  const [theme, setTheme] = useStored<"dark" | "light">(THEME_KEY, "dark");
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);
  return { theme, setTheme };
}

const SEEN_SPLASH = "preznt_splash_seen";
export function getSeenSplash(): boolean {
  if (typeof window === "undefined") return true;
  return !!sessionStorage.getItem(SEEN_SPLASH);
}
export function markSeenSplash() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SEEN_SPLASH, "1");
}

export function computeStreak(records: AttendanceRecord[]): number {
  const dates = new Set(records.map((r) => r.date));
  let streak = 0;
  const d = new Date();
  if (!dates.has(toISO(d))) d.setDate(d.getDate() - 1);
  while (dates.has(toISO(d))) { streak += 1; d.setDate(d.getDate() - 1); }
  return streak;
}

export interface AttendanceStats {
  present: number; late: number; absent: number; total: number; rate: number;
}
export function computeAttendance(
  records: AttendanceRecord[], firstLoginISO: string, subjectFilter?: string,
): AttendanceStats {
  if (!firstLoginISO) return { present: 0, late: 0, absent: 0, total: 0, rate: 0 };
  const start = fromISO(firstLoginISO);
  const now = new Date();
  const todayISO = toISO(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let present = 0, late = 0, absent = 0, total = 0, pct = 0;
  const cursor = new Date(start);
  while (toISO(cursor) <= todayISO) {
    const iso = toISO(cursor);
    const allSlots = slotsForDate(cursor);
    const slots = allSlots.filter((s) => !subjectFilter || s.subject === subjectFilter);
    for (const slot of slots) {
      const slotStartMin = toMin(slot.start);
      if (iso === todayISO && slotStartMin > nowMin) continue;
      total += 1;
      const rec = records.find((r) => r.date === iso && r.subject === slot.subject);
      if (rec) { if (rec.status === "Late") late += 1; else present += 1; }
      else absent += 1;
    }
    if (allSlots.length > 0) {
      const dayHasPassedSlot = iso !== todayISO || allSlots.some((s) => toMin(s.start) <= nowMin);
      if (dayHasPassedSlot) {
        const attendedAny = records.some((r) => r.date === iso);
        if (attendedAny) pct += 0.7;
        else if (iso !== todayISO) pct -= 3;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  const rate = Math.round(Math.max(0, Math.min(100, pct)) * 10) / 10;
  return { present, late, absent, total, rate };
}

export function classesNeeded(stats: AttendanceStats, target = 75): number {
  if (stats.rate >= target) return 0;
  return Math.ceil((target - stats.rate) / 0.7);
}

export function isLate(slotStart: string, markedAt: Date): boolean {
  const slot = toMin(slotStart);
  const mark = markedAt.getHours() * 60 + markedAt.getMinutes();
  return mark > slot + 15;
}

export { TIMETABLE };
