import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid,
} from "recharts";
import { Download, Printer, TrendingUp, Users, AlertTriangle, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useAuth, getAllStudentRecords, toISO, useReactiveStorage, MARK_LOG_KEY, type User as AuthUser } from "@/lib/storage";
import { shortLabel } from "@/lib/subjects";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — PREZNT" },
      { name: "description", content: "Class-wise attendance analytics, trends and exportable reports for professors." },
      { property: "og:title", content: "Analytics — PREZNT" },
      { property: "og:description", content: "Class-wise attendance analytics, trends and exportable reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { currentUser, loading } = useAuth();
  if (loading || !currentUser) return null;
  if (currentUser.role !== "Professor") {
    return (
      <div className="mx-auto w-full max-w-md px-5 pt-16 text-center">
        <h1 className="text-2xl font-semibold">Professors only</h1>
        <p className="mt-2 text-sm text-muted-foreground">Analytics reports are available to faculty accounts.</p>
        <Link to="/records" className="mt-6 inline-flex rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Go to records</Link>
      </div>
    );
  }
  return <ProfessorAnalytics user={currentUser} />;
}

function ProfessorAnalytics({ user }: { user: AuthUser }) {
  useReactiveStorage(MARK_LOG_KEY);
  const profSubjects = user.subjects ?? [];
  const [days, setDays] = useState(14);

  const records = useMemo(
    () => getAllStudentRecords().filter((r) => profSubjects.length === 0 || profSubjects.includes(r.subject)),
    [profSubjects],
  );

  const bySubject = useMemo(() => {
    const m = new Map<string, { subject: string; present: number; late: number }>();
    for (const r of records) {
      const cur = m.get(r.subject) ?? { subject: r.subject, present: 0, late: 0 };
      if (r.status === "Late") cur.late++; else cur.present++;
      m.set(r.subject, cur);
    }
    return Array.from(m.values()).map((s) => ({ ...s, label: shortLabel(s.subject), total: s.present + s.late }));
  }, [records]);

  const trend = useMemo(() => {
    const out: { date: string; label: string; marks: number }[] = [];
    const d = new Date();
    d.setDate(d.getDate() - (days - 1));
    for (let i = 0; i < days; i++) {
      const iso = toISO(d);
      out.push({
        date: iso,
        label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        marks: records.filter((r) => r.date === iso).length,
      });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [records, days]);

  const students = useMemo(() => {
    const m = new Map<string, { id: string; name: string; present: number; late: number; last: string }>();
    for (const r of records) {
      const cur = m.get(r.studentId) ?? { id: r.studentId, name: r.studentName, present: 0, late: 0, last: r.date };
      if (r.status === "Late") cur.late++; else cur.present++;
      if (r.date > cur.last) cur.last = r.date;
      m.set(r.studentId, cur);
    }
    return Array.from(m.values()).sort((a, b) => (a.present + a.late) - (b.present + b.late));
  }, [records]);

  const atRisk = students.filter((s) => s.present + s.late < 3);
  const totalMarks = records.length;
  const lateShare = totalMarks ? Math.round((records.filter((r) => r.status === "Late").length / totalMarks) * 100) : 0;

  function exportReport() {
    if (records.length === 0) { toast.error("No data to export"); return; }
    const header = ["Student", "ID", "Present", "Late", "Total", "Last marked"];
    const rows = students.map((s) => [s.name, s.id, s.present, s.late, s.present + s.late, s.last]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `preznt-report-${toISO(new Date())}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported");
  }

  function printReport() {
    toast.message("Opening print dialog", { description: "Choose “Save as PDF” to keep a copy." });
    setTimeout(() => window.print(), 200);
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6">
      <div className="label-eyebrow">Reports</div>
      <h1 className="mt-1 text-3xl font-semibold">Class analytics</h1>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Kpi icon={Users} label="Students" value={students.length} />
        <Kpi icon={TrendingUp} label="Marks" value={totalMarks} />
        <Kpi icon={AlertTriangle} label="Late %" value={`${lateShare}%`} />
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card mt-4 rounded-3xl p-5">
        <div className="label-eyebrow">Marks by subject</div>
        <div className="mt-4 h-52">
          {bySubject.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bySubject}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="currentColor" className="text-muted-foreground" />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={24} fontSize={11} stroke="currentColor" className="text-muted-foreground" />
                <Tooltip contentStyle={{ background: "hsl(0 0% 10%)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="present" stackId="a" fill="var(--color-success, #6bbd8e)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="late" stackId="a" fill="var(--color-amber, #e8d5b7)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card mt-3 rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <div className="label-eyebrow">Daily trend</div>
          <div className="flex gap-1">
            {[7, 14, 30].map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${days === d ? "bg-primary text-primary-foreground" : "bg-card/60 text-muted-foreground"}`}>
                {d}d
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} interval="preserveStartEnd" stroke="currentColor" className="text-muted-foreground" />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={24} fontSize={11} stroke="currentColor" className="text-muted-foreground" />
              <Tooltip contentStyle={{ background: "hsl(0 0% 10%)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, fontSize: 12 }} />
              <Line type="monotone" dataKey="marks" strokeWidth={2} dot={false} stroke="var(--color-primary, #e8d5b7)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <div className="glass-card mt-3 rounded-3xl p-5">
        <div className="label-eyebrow">At-risk students</div>
        {atRisk.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No student is flagged right now.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {atRisk.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-2xl bg-destructive/10 px-3.5 py-2.5">
                <div>
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.id} · last seen {s.last}</div>
                </div>
                <span className="text-xs font-semibold text-destructive">{s.present + s.late} marks</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={exportReport} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-card/60 py-3 text-sm font-medium transition hover:bg-card">
          <Download className="h-4 w-4" /> Export CSV
        </button>
        <button onClick={printReport} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-medium text-primary-foreground transition hover:scale-[1.01]">
          <Printer className="h-4 w-4" /> Save as PDF
        </button>
      </div>

      <Link to="/corrections" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card/60 py-3 text-sm font-medium transition hover:bg-card">
        <SlidersHorizontal className="h-4 w-4" /> Corrections &amp; audit log
      </Link>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <div className="glass-card rounded-2xl p-3.5">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div className="mt-2 text-xl font-semibold">{value}</div>
      <div className="label-eyebrow">{label}</div>
    </div>
  );
}

function Empty() {
  return <div className="grid h-full place-items-center text-sm text-muted-foreground">No attendance recorded yet.</div>;
}
