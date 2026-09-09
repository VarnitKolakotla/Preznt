import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { History, Plus, Trash2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  useAuth, getMarkLog, removeMarkLog, updateMarkLog, upsertMarkLog, uuid, toISO,
  useReactiveStorage, MARK_LOG_KEY, type MarkLogEntry, type User as AuthUser,
} from "@/lib/storage";
import { getAuditLog, appendAudit, AUDIT_STORAGE_KEY } from "@/lib/audit";

export const Route = createFileRoute("/corrections")({
  head: () => ({
    meta: [
      { title: "Corrections — PREZNT" },
      { name: "description", content: "Manually correct attendance marks and review the full audit trail." },
      { property: "og:title", content: "Corrections — PREZNT" },
      { property: "og:description", content: "Manually correct attendance marks and review the full audit trail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CorrectionsPage,
});

function CorrectionsPage() {
  const { currentUser, loading } = useAuth();
  if (loading || !currentUser) return null;
  if (currentUser.role !== "Professor") {
    return (
      <div className="mx-auto w-full max-w-md px-5 pt-16 text-center">
        <h1 className="text-2xl font-semibold">Professors only</h1>
        <p className="mt-2 text-sm text-muted-foreground">Attendance corrections are restricted to faculty accounts.</p>
        <Link to="/records" className="mt-6 inline-flex rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Go to records</Link>
      </div>
    );
  }
  return <Corrections user={currentUser} />;
}

function Corrections({ user }: { user: AuthUser }) {
  useReactiveStorage(MARK_LOG_KEY);
  useReactiveStorage(AUDIT_STORAGE_KEY);
  const subjects = user.subjects ?? [];
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const log = useMemo(
    () => getMarkLog().filter((e) => subjects.length === 0 || subjects.includes(e.subject)),
    [subjects],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return log.slice(0, 60);
    return log.filter((e) =>
      e.studentName.toLowerCase().includes(q) ||
      e.studentIdNumber.toLowerCase().includes(q) ||
      e.subject.toLowerCase().includes(q) ||
      e.date.includes(q),
    ).slice(0, 60);
  }, [log, query]);

  const audit = getAuditLog();

  function toggleStatus(e: MarkLogEntry) {
    const next = e.status === "Present" ? "Late" : "Present";
    updateMarkLog(e.id, { status: next });
    appendAudit({
      actorId: user.uuid, actorName: user.name, action: "status_changed",
      studentName: e.studentName, studentIdNumber: e.studentIdNumber, subject: e.subject,
      date: e.date, detail: `${e.status} → ${next}`,
    });
    toast.success(`Marked ${next}`);
  }

  function remove(e: MarkLogEntry) {
    removeMarkLog(e.id);
    appendAudit({
      actorId: user.uuid, actorName: user.name, action: "mark_removed",
      studentName: e.studentName, studentIdNumber: e.studentIdNumber, subject: e.subject,
      date: e.date, detail: "Attendance mark deleted",
    });
    toast.success("Mark removed");
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6">
      <div className="label-eyebrow">Admin</div>
      <h1 className="mt-1 text-3xl font-semibold">Corrections</h1>
      <p className="mt-1 text-sm text-muted-foreground">Fix a wrong mark, add a missed one — every change is logged.</p>

      <div className="mt-5 flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search student, ID, subject or date"
          className="flex-1 rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm outline-none focus:border-primary/50" />
        <button onClick={() => setAddOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-medium text-primary-foreground">
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      {addOpen && <AddMarkForm user={user} subjects={subjects} onDone={() => setAddOpen(false)} />}

      <div className="glass-card mt-4 rounded-3xl p-2">
        {filtered.length === 0 ? (
          <div className="py-14 text-center text-sm text-muted-foreground">No marks match this search.</div>
        ) : filtered.map((e, i) => (
          <motion.div key={e.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${i % 2 === 1 ? "bg-card/30" : ""}`}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{e.studentName}</div>
              <div className="truncate text-xs text-muted-foreground">{e.studentIdNumber} · {e.subject} · {e.date} {e.timeMarked}</div>
            </div>
            <button onClick={() => toggleStatus(e)} title="Toggle Present / Late"
              className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${e.status === "Late" ? "bg-amber/15 text-amber" : "bg-success/15 text-success"}`}>
              {e.status}
            </button>
            <button onClick={() => remove(e)} title="Delete mark" className="rounded-xl p-2 text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <div className="label-eyebrow">Audit log</div>
      </div>
      <div className="glass-card mt-2 rounded-3xl p-2">
        {audit.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No changes recorded yet.</div>
        ) : audit.slice(0, 40).map((a, i) => (
          <div key={a.id} className={`flex items-start gap-3 rounded-2xl px-4 py-3 ${i % 2 === 1 ? "bg-card/30" : ""}`}>
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="text-sm">
                <span className="font-medium">{a.actorName}</span> · {a.action.replace(/_/g, " ")}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {a.studentName} ({a.studentIdNumber}) · {a.subject} · {a.date} — {a.detail}
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                {new Date(a.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Link to="/analytics" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card/60 py-3 text-sm font-medium transition hover:bg-card">
        <RefreshCw className="h-4 w-4" /> Back to analytics
      </Link>
    </div>
  );
}

function AddMarkForm({ user, subjects, onDone }: { user: AuthUser; subjects: string[]; onDone: () => void }) {
  const known = useMemo(() => {
    const m = new Map<string, { name: string; id: string; uuid: string }>();
    for (const e of getMarkLog()) m.set(e.studentIdNumber, { name: e.studentName, id: e.studentIdNumber, uuid: e.studentID });
    return Array.from(m.values());
  }, []);
  const [name, setName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [subject, setSubject] = useState(subjects[0] ?? "");
  const [date, setDate] = useState(toISO(new Date()));
  const [status, setStatus] = useState<"Present" | "Late">("Present");

  function submit() {
    if (!name.trim() || !idNumber.trim() || !subject) { toast.error("Fill in student, ID and subject"); return; }
    const match = known.find((k) => k.id === idNumber.trim());
    const now = new Date();
    const entry: MarkLogEntry = {
      id: uuid(),
      studentID: match?.uuid ?? `manual-${idNumber.trim()}`,
      studentName: name.trim(),
      studentIdNumber: idNumber.trim(),
      subject,
      professorID: user.uuid,
      professorName: user.name,
      sessionID: "manual",
      date,
      timeMarked: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      status,
      faceConfidence: 0,
    };
    upsertMarkLog(entry);
    appendAudit({
      actorId: user.uuid, actorName: user.name, action: "mark_added",
      studentName: entry.studentName, studentIdNumber: entry.studentIdNumber,
      subject, date, detail: `Manually added as ${status}`,
    });
    toast.success("Attendance added");
    onDone();
  }

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="glass-card mt-3 overflow-hidden rounded-3xl p-5">
      <div className="label-eyebrow">Add a missed mark</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input list="preznt-known-students" value={name} onChange={(e) => {
          setName(e.target.value);
          const k = known.find((x) => x.name === e.target.value);
          if (k) setIdNumber(k.id);
        }} placeholder="Student name" className="rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm outline-none focus:border-primary/50" />
        <datalist id="preznt-known-students">{known.map((k) => <option key={k.id} value={k.name} />)}</datalist>
        <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="Roll number"
          className="rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm outline-none focus:border-primary/50" />
        <select value={subject} onChange={(e) => setSubject(e.target.value)}
          className="rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm outline-none focus:border-primary/50">
          {(subjects.length ? subjects : ["—"]).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm outline-none focus:border-primary/50" />
      </div>
      <div className="mt-3 flex items-center gap-2">
        {(["Present", "Late"] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${status === s ? "bg-primary text-primary-foreground" : "bg-card/60 text-muted-foreground"}`}>{s}</button>
        ))}
        <button onClick={submit} className="ml-auto rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Save</button>
      </div>
    </motion.div>
  );
}
