import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { AttendanceRecord } from "@/lib/storage";
import { fromISO, toISO } from "@/lib/storage";
import { slotsForDate } from "@/lib/schedule";

// Academic year: June (current/last) → April (next)
function buildMonths(): Date[] {
  const now = new Date();
  const startYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  const months: Date[] = [];
  for (let i = 0; i < 11; i++) {
    months.push(new Date(startYear, 5 + i, 1));
  }
  return months;
}

interface DayInfo {
  date: string;
  day: number;
  status: "present" | "late" | "absent" | "noclass" | "future" | "preLogin" | "empty";
  isToday?: boolean;
  rec?: AttendanceRecord;
}

export function AcademicYearCalendar({ records, firstLoginISO }: { records: AttendanceRecord[]; firstLoginISO: string }) {
  const months = useMemo(buildMonths, []);
  const [selected, setSelected] = useState<DayInfo | null>(null);
  const today = new Date();
  const todayISO = toISO(today);
  const firstLogin = fromISO(firstLoginISO);

  return (
    <div className="space-y-6">
      <div className="max-h-[560px] overflow-y-auto pr-1 space-y-6">
        {months.map((m) => (
          <MonthGrid
            key={m.toISOString()}
            month={m}
            records={records}
            firstLogin={firstLogin}
            today={today}
            todayISO={todayISO}
            onSelect={setSelected}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <Legend color="bg-success/50" label="Present" />
        <Legend color="bg-amber/60" label="Late" />
        <Legend color="bg-destructive/50" label="Absent" />
        <Legend color="bg-card/70" label="No class / future" />
      </div>

      {selected && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={(e) => e.stopPropagation()}
            className="glass-card mx-4 w-full max-w-sm rounded-3xl p-5">
            <div className="label-eyebrow">{fromISO(selected.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
            <div className="mt-2 text-base font-semibold">
              {selected.rec ? selected.rec.subject : selected.status === "absent" ? "Class missed" : selected.status === "noclass" ? "No class scheduled" : selected.status === "future" ? "Upcoming" : "Before enrollment"}
            </div>
            {selected.rec && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-card/60 p-3"><div className="label-eyebrow">Status</div><div className="mt-0.5 font-medium">{selected.rec.status}</div></div>
                <div className="rounded-xl bg-card/60 p-3"><div className="label-eyebrow">Time</div><div className="mt-0.5 font-medium">{selected.rec.time}</div></div>
              </div>
            )}
            <button onClick={() => setSelected(null)} className="mt-4 w-full rounded-2xl bg-primary py-2.5 text-sm font-medium text-primary-foreground">Close</button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

function MonthGrid({ month, records, firstLogin, today, todayISO, onSelect }:
  { month: Date; records: AttendanceRecord[]; firstLogin: Date; today: Date; todayISO: string; onSelect: (d: DayInfo) => void; }
) {
  const cells: DayInfo[] = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = first.getDay();
    const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: DayInfo[] = [];
    for (let i = 0; i < offset; i++) out.push({ date: "", day: 0, status: "empty" });
    for (let d = 1; d <= daysIn; d++) {
      const dt = new Date(month.getFullYear(), month.getMonth(), d);
      const iso = toISO(dt);
      const isToday = iso === todayISO;
      let status: DayInfo["status"];
      let rec: AttendanceRecord | undefined;
      if (dt < firstLogin && iso !== toISO(firstLogin)) {
        status = "preLogin";
      } else if (dt > today && !isToday) {
        status = "future";
      } else {
        const slots = slotsForDate(dt);
        if (slots.length === 0) status = "noclass";
        else {
          rec = records.find((r) => r.date === iso);
          if (rec) status = rec.status === "Late" ? "late" : "present";
          else status = "absent";
        }
      }
      out.push({ date: iso, day: d, status, isToday, rec });
    }
    return out;
  }, [month, records, firstLogin, today, todayISO]);

  return (
    <div>
      <div className="mb-2 text-sm font-semibold">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
      <div className="grid grid-cols-7 gap-1.5">
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} className="text-center text-[10px] uppercase tracking-widest text-muted-foreground">{d}</div>
        ))}
        {cells.map((c, i) => (
          <button
            key={i}
            disabled={c.status === "empty"}
            onClick={() => c.status !== "empty" && onSelect(c)}
            className={`aspect-square rounded-lg text-[11px] transition ${
              c.status === "empty" ? "opacity-0" :
              c.status === "present" ? "bg-success/40 text-success hover:bg-success/55" :
              c.status === "late" ? "bg-amber/40 text-amber hover:bg-amber/55" :
              c.status === "absent" ? "bg-destructive/30 text-destructive hover:bg-destructive/45" :
              "bg-card/60 text-muted-foreground hover:bg-card"
            } ${c.isToday ? "ring-2 ring-primary" : ""}`}
          >
            {c.day || ""}
          </button>
        ))}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}
