import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { Download, Inbox, AlertTriangle, Search, BarChart3, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { User as AuthUser } from "@/lib/storage";
import { useAuth, useUserRecords, getFirstLoginDate, computeAttendance, classesNeeded, toISO, getAllStudentRecords } from "@/lib/storage";
import { computeSubjectStats, persistSubjectStats, overallPercent } from "@/lib/percentage";
import { TRACKED_SUBJECTS } from "@/lib/subjects";
import { AcademicYearCalendar } from "@/components/academic-calendar";

export const Route = createFileRoute("/records")({
  head: () => ({ meta: [{ title: "Records — PREZNT" }] }),
  component: RecordsRouter,
});

function RecordsRouter() {
  const { currentUser, loading } = useAuth();
  if (loading || !currentUser) return null;
  return currentUser.role === "Professor"
    ? <ProfessorRecords user={currentUser} />
    : <StudentRecords user={currentUser} />;
}

// ──────────────────────────────────────────────────────────────────────
// STUDENT RECORDS
// ──────────────────────────────────────────────────────────────────────
function StudentRecords({ user: currentUser }: { user: AuthUser }) {
  const { records } = useUserRecords(currentUser.uuid);
  const firstLogin = getFirstLoginDate(currentUser.uuid) ?? toISO(new Date());
  const subjects = useMemo(() => ["All", ...TRACKED_SUBJECTS], []);
  const [subject, setSubject] = useState("All");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Present" | "Late">("All");

  const filter = subject === "All" ? undefined : subject;
  const subjectStats = useMemo(() => {
    const st = computeSubjectStats(records, firstLogin);
    persistSubjectStats(currentUser.uuid, st);
    return st;
  }, [records, firstLogin, currentUser]);
  const percent = filter
    ? (subjectStats.find((s) => s.subject === filter)?.percent ?? 0)
    : overallPercent(subjectStats);
  const stats = useMemo(() => computeAttendance(records, firstLogin, filter), [records, firstLogin, filter]);
  const subjectRecords = useMemo(() => (filter ? records.filter((r) => r.subject === filter) : records), [records, filter]);
  const filteredRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    return subjectRecords.filter((r) => {
      if (statusFilter !== "All" && r.status !== statusFilter) return false;
      if (!q) return true;
      return r.subject.toLowerCase().includes(q) || r.date.includes(q) || r.status.toLowerCase().includes(q);
    });
  }, [subjectRecords, query, statusFilter]);
  const monthly = useMemo(() => {
    const m = new Map<string, { key: string; label: string; present: number; late: number }>();
    for (const r of subjectRecords) {
      const key = r.date.slice(0, 7);
      const cur = m.get(key) ?? {
        key,
        label: new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        present: 0, late: 0,
      };
      if (r.status === "Late") cur.late++; else cur.present++;
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.key.localeCompare(a.key)).slice(0, 6);
  }, [subjectRecords]);
  const needed = classesNeeded(stats, 75);

  function exportCSV() {
    if (filteredRecords.length === 0) { toast.error("Nothing to export"); return; }
    const header = ["Date", "Subject", "Time", "Status", "Confidence", "Method"];
    const rows = filteredRecords.map((r) => [r.date, r.subject, r.time, r.status, `${r.confidence}%`, r.method]);
    const csv = [header, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `preznt-${toISO(new Date())}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6">
      <div className="label-eyebrow">History</div>
      <h1 className="mt-1 text-3xl font-semibold">Your records</h1>

      {/* Subject filter */}
      <div className="mt-5 flex gap-2 overflow-x-auto pb-2 -mx-5 px-5">
        {subjects.map((s) => (
          <button key={s} onClick={() => setSubject(s)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              subject === s ? "bg-primary text-primary-foreground" : "bg-card/60 text-muted-foreground hover:bg-card"
            }`}>{s}</button>
        ))}
      </div>

      {/* Search + status */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search date, subject or status"
            className="w-full rounded-2xl border border-border bg-card/60 py-2.5 pl-9 pr-4 text-sm outline-none focus:border-primary/50" />
        </div>
        <div className="flex gap-2">
          {(["All", "Present", "Late"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3.5 py-2 text-xs font-medium transition ${
                statusFilter === s ? "bg-primary text-primary-foreground" : "bg-card/60 text-muted-foreground hover:bg-card"
              }`}>{s}</button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card mt-4 rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <div className="label-eyebrow">{subject === "All" ? "Overall" : subject}</div>
          <span className="text-xs text-muted-foreground">{stats.present + stats.late} / {stats.total} classes</span>
        </div>
        <div className="mt-1 text-4xl font-semibold">{percent.toFixed(1)}%</div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-card">
          <motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 1, ease: "easeOut" }}
            className={`h-full rounded-full ${percent < 75 ? "bg-destructive" : "bg-gradient-to-r from-sand to-sage"}`} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <Stat label="Present" value={stats.present} className="text-success" />
          <Stat label="Late" value={stats.late} className="text-amber" />
          <Stat label="Absent" value={stats.absent} className="text-destructive" />
        </div>
      </motion.div>

      {percent < 75 && (
        <div className="mt-3 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive shrink-0" />
          <div>
            <div className="font-medium text-destructive">{subject === "All" ? "Overall" : subject} is at {percent.toFixed(1)}%</div>
            <div className="text-xs text-destructive/80">Attend {needed} more to reach 75%</div>
          </div>
        </div>
      )}

      {/* Monthly summary */}
      {monthly.length > 0 && (
        <div className="mt-4 glass-card rounded-3xl p-5">
          <div className="label-eyebrow mb-3">Monthly summary</div>
          <div className="space-y-3">
            {monthly.map((m) => (
              <div key={m.key}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium">{m.label}</span>
                  <span className="text-muted-foreground">{m.present + m.late} classes</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-card">
                  <div className="flex h-full rounded-full">
                    <div className="h-full bg-success" style={{ width: `${m.present + m.late === 0 ? 0 : (m.present / (m.present + m.late)) * 100}%` }} />
                    <div className="h-full bg-amber" style={{ width: `${m.present + m.late === 0 ? 0 : (m.late / (m.present + m.late)) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Records table */}
      <div className="mt-5 glass-card rounded-3xl p-2">
        {filteredRecords.length === 0 ? (
          <div className="grid place-items-center py-14 text-center">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-card/60"><Inbox className="h-5 w-5 text-muted-foreground" /></div>
            <div className="text-base font-semibold">No records yet</div>
            <Link to="/scan" search={{ subject: undefined }} className="mt-4 rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Mark attendance</Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl">
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 px-4 py-3 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>Date</span><span>Subject</span><span>Time</span><span>Status</span>
            </div>
            {filteredRecords.map((r, i) => (
              <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: Math.min(i * 0.03, 0.4) }}
                className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-3 text-sm ${i % 2 === 1 ? "bg-card/30" : ""}`}>
                <div className="text-xs text-muted-foreground">{new Date(r.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                <div className="truncate text-sm">{r.subject}</div>
                <div className="text-xs text-muted-foreground">{r.time}</div>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${r.status === "Late" ? "bg-amber/15 text-amber" : "bg-success/15 text-success"}`}>{r.status}</span>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <button onClick={exportCSV} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card/60 py-3 text-sm font-medium transition hover:bg-card">
        <Download className="h-4 w-4" /> Export to CSV
      </button>

      <div className="mt-6">
        <div className="label-eyebrow mb-3">Academic year</div>
        <AcademicYearCalendar records={filteredRecords} firstLoginISO={firstLogin} />
      </div>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-xl bg-card/60 p-2.5">
      <div className="label-eyebrow">{label}</div>
      <div className={`mt-0.5 text-base font-semibold ${className}`}>{value}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// PROFESSOR RECORDS
// ──────────────────────────────────────────────────────────────────────
function ProfessorRecords({ user: currentUser }: { user: AuthUser }) {
  const profSubjects = currentUser.subjects ?? [];
  const subjects = useMemo(() => ["All", ...profSubjects], [profSubjects]);
  const [subject, setSubject] = useState("All");
  const allRecords = useMemo(
    () => getAllStudentRecords().filter((r) => profSubjects.includes(r.subject)),
    [profSubjects],
  );

  // Group by student
  const grouped = useMemo(() => {
    const filtered = subject === "All" ? allRecords : allRecords.filter((r) => r.subject === subject);
    const byId = new Map<string, { name: string; id: string; present: number; late: number }>();
    for (const r of filtered) {
      const cur = byId.get(r.studentId) ?? { name: r.studentName, id: r.studentId, present: 0, late: 0 };
      if (r.status === "Late") cur.late++; else cur.present++;
      byId.set(r.studentId, cur);
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allRecords, subject]);

  function exportCSV() {
    if (grouped.length === 0) { toast.error("Nothing to export"); return; }
    const header = ["Student", "ID", "Present", "Late", "Total"];
    const rows = grouped.map((g) => [g.name, g.id, g.present, g.late, g.present + g.late]);
    const csv = [header, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `preznt-class-${toISO(new Date())}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6">
      <div className="label-eyebrow">Class records</div>
      <h1 className="mt-1 text-3xl font-semibold">Student attendance</h1>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-2 -mx-5 px-5">
        {subjects.map((s) => (
          <button key={s} onClick={() => setSubject(s)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${subject === s ? "bg-primary text-primary-foreground" : "bg-card/60 text-muted-foreground hover:bg-card"}`}>
            {s}
          </button>
        ))}
      </div>

      <div className="mt-5 glass-card rounded-3xl p-2">
        {grouped.length === 0 ? (
          <div className="py-14 text-center text-sm text-muted-foreground">No attendance yet for this filter.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-3 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>Student</span><span>Present</span><span>Late</span><span>Total</span>
            </div>
            {grouped.map((g, i) => (
              <motion.div key={g.id} initial={{ opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: Math.min(i * 0.04, 0.3) }}
                className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-3 text-sm ${i % 2 === 1 ? "bg-card/30" : ""}`}>
                <div>
                  <div className="font-medium">{g.name}</div>
                  <div className="text-xs text-muted-foreground">{g.id}</div>
                </div>
                <div className="text-success">{g.present}</div>
                <div className="text-amber">{g.late}</div>
                <div className="font-medium">{g.present + g.late}</div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <button onClick={exportCSV} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card/60 py-3 text-sm font-medium transition hover:bg-card">
        <Download className="h-4 w-4" /> Export CSV
      </button>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link to="/analytics" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-card/60 py-3 text-sm font-medium transition hover:bg-card">
          <BarChart3 className="h-4 w-4" /> Analytics
        </Link>
        <Link to="/corrections" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-card/60 py-3 text-sm font-medium transition hover:bg-card">
          <SlidersHorizontal className="h-4 w-4" /> Corrections
        </Link>
      </div>
    </div>
  );
}
