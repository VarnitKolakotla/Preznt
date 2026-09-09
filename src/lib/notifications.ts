/**
 * Derived notification centre.
 *
 * Notifications are computed from live app state (active session, attendance
 * percentages, pending requests) rather than stored, so they can never drift.
 * Only the "read" state is persisted.
 */
import { useMemo } from "react";
import {
  getActiveSession, getLateRequests, getReenrollRequests, getMarkLog,
  useReactiveStorage, getFirstLoginDate, toISO, type User, type AttendanceRecord,
} from "./storage";
import { computeSubjectStats } from "./percentage";

export type NotifTone = "info" | "success" | "warning" | "danger";

export interface Notification {
  id: string;
  title: string;
  body: string;
  tone: NotifTone;
  at: number;
  to?: "/scan" | "/records" | "/corrections" | "/analytics";
}

const READ_KEY = "preznt_notif_read";

export function getReadIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(READ_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function markAllRead(ids: string[]) {
  if (typeof window === "undefined") return;
  const merged = Array.from(new Set([...getReadIds(), ...ids])).slice(-300);
  localStorage.setItem(READ_KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent("preznt:storage", { detail: { key: READ_KEY } }));
}

export function useNotifications(user: User | null, records: AttendanceRecord[]) {
  useReactiveStorage("preznt_active_session");
  useReactiveStorage("preznt_late_requests");
  useReactiveStorage("preznt_reenroll_requests");
  useReactiveStorage(READ_KEY);

  return useMemo(() => {
    if (!user || typeof window === "undefined") {
      return { items: [] as Notification[], unread: 0 };
    }
    const items: Notification[] = [];
    const session = getActiveSession();
    const late = getLateRequests();
    const reenroll = getReenrollRequests();

    if (user.role === "Professor") {
      if (session) {
        items.push({
          id: `sess-${session.id}`,
          title: "Session running",
          body: `${session.subject} — students can mark until the timer ends.`,
          tone: "info", at: session.startedAt, to: "/scan",
        });
      }
      for (const r of late.filter((x) => x.status === "pending")) {
        items.push({
          id: `late-${r.id}`,
          title: "Late arrival request",
          body: `${r.studentName} (${r.studentIdNumber ?? ""}) requested late attendance for ${r.subject}.`,
          tone: "warning", at: r.timestamp, to: "/scan",
        });
      }
      for (const r of reenroll.filter((x) => x.status === "pending")) {
        items.push({
          id: `re-${r.id}`,
          title: "Face re-enrollment request",
          body: `${r.studentName} asked to re-register their face.`,
          tone: "warning", at: r.requestedAt, to: "/scan",
        });
      }
      // At-risk summary from the class-wide mark log
      const log = getMarkLog();
      const perStudent = new Map<string, number>();
      for (const e of log) perStudent.set(e.studentID, (perStudent.get(e.studentID) ?? 0) + 1);
      const quiet = Array.from(perStudent.values()).filter((n) => n < 3).length;
      if (quiet > 0) {
        items.push({
          id: `risk-${quiet}`,
          title: `${quiet} student${quiet > 1 ? "s" : ""} at risk`,
          body: "Fewer than 3 marks recorded. Review the analytics report.",
          tone: "danger", at: Date.now(), to: "/analytics",
        });
      }
    } else {
      if (session) {
        items.push({
          id: `sess-${session.id}`,
          title: "Attendance is open",
          body: `${session.professorName} started ${session.subject}. Mark now.`,
          tone: "success", at: session.startedAt, to: "/scan",
        });
      }
      const mine = late.filter((r) => r.studentId === user.uuid && r.status !== "pending");
      for (const r of mine.slice(0, 5)) {
        items.push({
          id: `late-${r.id}-${r.status}`,
          title: r.status === "approved" ? "Late request approved" : "Late request denied",
          body: `${r.subject} — ${r.status === "approved" ? "you were marked Late." : "you were not marked."}`,
          tone: r.status === "approved" ? "success" : "danger",
          at: r.timestamp, to: "/records",
        });
      }
      const first = getFirstLoginDate(user.uuid) ?? toISO(new Date());
      for (const s of computeSubjectStats(records, first)) {
        if (s.total >= 3 && s.percent < 75) {
          items.push({
            id: `low-${s.subject}-${Math.round(s.percent)}`,
            title: `${s.subject} below 75%`,
            body: `You're at ${s.percent.toFixed(1)}%. Attend the next classes to recover.`,
            tone: "danger", at: Date.now(), to: "/records",
          });
        }
      }
    }

    items.sort((a, b) => b.at - a.at);
    const read = new Set(getReadIds());
    return { items, unread: items.filter((i) => !read.has(i.id)).length };
  }, [user, records]);
}
