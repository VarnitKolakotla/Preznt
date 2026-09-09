import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo } from "react";
import { CheckCircle2, Clock, Flame, ScanFace, ArrowRight, AlertTriangle, Sparkles, Users } from "lucide-react";
import { computeSubjectStats, persistSubjectStats, overallPercent } from "@/lib/percentage";
import type { User as AuthUser } from "@/lib/storage";
import { useAuth, useUserRecords, computeStreak, computeAttendance, classesNeeded, getFirstLoginDate, getAllStudentRecords, toISO, useReactiveStorage } from "@/lib/storage";
import { slotsForDate, formatTime12, currentSlot } from "@/lib/schedule";


export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Home — PREZNT" }, { name: "description", content: "Your attendance dashboard." }] }),
  component: HomeRouter,
});

function HomeRouter() {
  const { currentUser, loading } = useAuth();
  if (loading || !currentUser) return null;
  return currentUser.role === "Professor" ? <ProfessorHome user={currentUser} /> : <StudentHome user={currentUser} />;
}

// ──────────────────────────────────────────────────────────────────────
// STUDENT HOME
// ──────────────────────────────────────────────────────────────────────
function StudentHome({ user: currentUser }: { user: AuthUser }) {
  const { records } = useUserRecords(currentUser.uuid);
  useReactiveStorage("preznt_active_session");
  const firstLogin = getFirstLoginDate(currentUser.uuid) ?? toISO(new Date());

  const stats = useMemo(() => computeAttendance(records, firstLogin), [records, firstLogin]);
  const subjectStats = useMemo(() => {
    const st = computeSubjectStats(records, firstLogin);
    persistSubjectStats(currentUser.uuid, st);
    return st;
  }, [records, firstLogin, currentUser]);
  const percent = overallPercent(subjectStats);
  const needed = classesNeeded(stats, 75);
  const streak = computeStreak(records);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const today = new Date();
  const todaySlots = slotsForDate(today);
  const display = currentUser.name.startsWith("Dr.") ? currentUser.name.split(" ").slice(0, 2).join(" ") : currentUser.name.split(" ")[0];

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="label-eyebrow">{today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
        <h1 className="mt-1 text-3xl font-semibold">{greeting}, <span className="text-gradient-warm">{display}</span></h1>
      </motion.div>

      {/* Warning / praise banner — only below 75% or above 85% */}
      <AnimatePresence>
        {percent < 75 && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mt-5 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive shrink-0" />
            <div>
              <div className="font-medium text-destructive">Your attendance is below 75%</div>
              <div className="mt-0.5 text-xs text-destructive/80">Attend {needed} more {needed === 1 ? "day" : "days"} to reach 75%.</div>
            </div>
          </motion.div>
        )}
        {percent >= 85 && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mt-5 flex items-center gap-3 rounded-2xl border border-success/30 bg-success/10 p-4 text-sm text-success">
            <Sparkles className="h-4 w-4" /> You're on track
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ring */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="glass-card mt-4 flex items-center gap-6 rounded-3xl p-6">
        <Ring percent={percent} />
        <div>
          <div className="label-eyebrow">Overall attendance</div>
          <div className="text-4xl font-semibold tracking-tight">{percent.toFixed(1)}%</div>
          <div className="mt-1 text-sm text-muted-foreground">{stats.present + stats.late} days attended</div>
        </div>
      </motion.div>

      {/* 3 stats only */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat icon={CheckCircle2} label="Present" value={stats.present} className="text-success" />
        <Stat icon={Clock} label="Late" value={stats.late} className="text-amber" />
        <Stat icon={Flame} label="Streak" value={streak} suffix={streak === 1 ? "d" : "d"} className="text-sand" />
      </div>

      {/* Mark CTA */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-4">
        <Link to="/scan" search={{ subject: undefined }} className="group flex items-center justify-between rounded-3xl bg-primary px-5 py-4 text-primary-foreground transition hover:scale-[1.01]">
          <div className="flex items-center gap-3">
            <ScanFace className="h-5 w-5" />
            <div>
              <div className="text-sm font-semibold">Mark attendance</div>
              <div className="text-xs opacity-70">{currentSlot(today)?.subject ?? "Next class"}</div>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </motion.div>

      {/* Today's classes */}
      <div className="mt-6">
        <div className="label-eyebrow mb-3">Today's classes</div>
        {todaySlots.length === 0 ? (
          <div className="glass-card rounded-2xl p-5 text-sm text-muted-foreground">No classes today. Enjoy your day.</div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5">
            {todaySlots.map((s, i) => {
              const rec = records.find((r) => r.date === toISO(today) && r.subject === s.subject);
              return (
                <Link key={i} to="/scan" search={{ subject: s.subject } as any}
                  className="block">
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
                    className="min-w-[200px] shrink-0 rounded-2xl bg-card/60 p-4 ring-1 ring-inset ring-white/5 transition hover:bg-card">
                    <div className="text-xs text-muted-foreground">{formatTime12(s.start)} – {formatTime12(s.end)}</div>
                    <div className="mt-1 line-clamp-2 text-sm font-semibold">{s.subject}</div>
                    <div className="mt-3">
                      {rec ? (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${rec.status === "Late" ? "bg-amber/15 text-amber" : "bg-success/15 text-success"}`}>
                          {rec.status}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[10px] text-muted-foreground">Pending</span>
                      )}
                    </div>
                  </motion.div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

function Ring({ percent }: { percent: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, percent)) / 100) * c;
  return (
    <div className="relative h-[100px] w-[100px]">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="8" fill="none" />
        <motion.circle
          cx="50" cy="50" r={r} stroke="var(--primary)" strokeWidth="8" fill="none" strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-[13px] font-semibold">{percent.toFixed(1)}%</div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, suffix = "", className = "" }: { icon: any; label: string; value: number; suffix?: string; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-3.5">
      <Icon className={`h-4 w-4 ${className}`} />
      <div className="mt-2 label-eyebrow">{label}</div>
      <div className="mt-0.5 text-lg font-semibold">{value}{suffix}</div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// PROFESSOR HOME
// ──────────────────────────────────────────────────────────────────────
function ProfessorHome({ user: currentUser }: { user: AuthUser }) {
  const today = new Date();
  const todaySlots = slotsForDate(today);
  const allRecords = getAllStudentRecords();
  const todayRecords = allRecords.filter((r) => r.date === toISO(today));

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6">
      <div className="label-eyebrow">{today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
      <h1 className="mt-1 text-3xl font-semibold">{greeting}, <span className="text-gradient-warm">{currentUser.name}</span></h1>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="glass-card rounded-2xl p-4">
          <Users className="h-4 w-4 text-sand" />
          <div className="mt-2 label-eyebrow">Marked today</div>
          <div className="mt-0.5 text-2xl font-semibold">{new Set(todayRecords.map((r) => r.studentId)).size}</div>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <Clock className="h-4 w-4 text-amber" />
          <div className="mt-2 label-eyebrow">Classes today</div>
          <div className="mt-0.5 text-2xl font-semibold">{todaySlots.length}</div>
        </div>
      </div>

      <div className="mt-6">
        <div className="label-eyebrow mb-3">Today's classes</div>
        {todaySlots.length === 0 ? (
          <div className="glass-card rounded-2xl p-5 text-sm text-muted-foreground">No classes today.</div>
        ) : (
          <div className="space-y-3">
            {todaySlots.map((s, i) => {
              const presentCount = new Set(todayRecords.filter((r) => r.subject === s.subject).map((r) => r.studentId)).size;
              return (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass-card flex items-center justify-between rounded-2xl p-4">
                  <div>
                    <div className="text-sm font-semibold">{s.subject}</div>
                    <div className="text-xs text-muted-foreground">{formatTime12(s.start)} – {formatTime12(s.end)} · {presentCount} present</div>
                  </div>
                  <Link to="/scan" search={{ subject: undefined }} className="rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Start</Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
