/**
 * Audit log — every manual attendance correction made by a professor.
 * Append-only, stored locally alongside the mark log.
 */
import { uuid } from "./storage";

export interface AuditEntry {
  id: string;
  at: number;
  actorId: string;
  actorName: string;
  action: "mark_added" | "mark_removed" | "status_changed";
  studentName: string;
  studentIdNumber: string;
  subject: string;
  date: string;
  detail: string;
}

const AUDIT_KEY = "preznt_audit_log";

export function getAuditLog(): AuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    return raw ? (JSON.parse(raw) as AuditEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendAudit(entry: Omit<AuditEntry, "id" | "at">) {
  if (typeof window === "undefined") return;
  const full: AuditEntry = { ...entry, id: uuid(), at: Date.now() };
  localStorage.setItem(AUDIT_KEY, JSON.stringify([full, ...getAuditLog()].slice(0, 500)));
  window.dispatchEvent(new CustomEvent("preznt:storage", { detail: { key: AUDIT_KEY } }));
}

export const AUDIT_STORAGE_KEY = AUDIT_KEY;
