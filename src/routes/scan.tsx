import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  CheckCircle2, Loader2, RotateCw, ScanFace, QrCode, ArrowRight, Users,
  Clock, Play, Square, Hourglass, Bell, ThumbsUp, ThumbsDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAuth, useUserRecords, getFaceDescriptor, computeAttendance, getFirstLoginDate,
  toISO, uuid, getAllStudentRecords, attendanceKey, useReactiveStorage,
  getActiveSession, startSession as startSessionApi, endSession,
  getLateRequests, addLateRequest, updateLateRequest,
  getReenrollRequests, updateReenrollRequest, appendMarkLog,
  type ProfSession, type LateRequest,
} from "@/lib/storage";
import type { AttendanceRecord } from "@/lib/storage";
import { loadFaceApi, detectDescriptor, euclidean, startCamera, stopCamera } from "@/lib/face-api";
import { slotsForDate, formatTime12 } from "@/lib/schedule";
import { isTracked } from "@/lib/subjects";

export const Route = createFileRoute("/scan")({
  head: () => ({ meta: [{ title: "Mark Attendance — PREZNT" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ subject: typeof s.subject === "string" ? s.subject : undefined }),
  component: ScanRouter,
});

function ScanRouter() {
  const { currentUser, loading } = useAuth();
  if (loading || !currentUser) return null;
  return currentUser.role === "Professor" ? <ProfessorScan /> : <StudentScan />;
}

function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// ──────────────────────────────────────────────────────────────────────
// STUDENT SCAN
// ──────────────────────────────────────────────────────────────────────
type ScanState = "idle" | "loading" | "ready" | "verifying" | "matched" | "nomatch" | "noface" | "error" | "awaitingApproval" | "done";

function StudentScan() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { records, addRecord } = useUserRecords(currentUser!.uuid);
  useReactiveStorage("preznt_active_session");
  useReactiveStorage("preznt_late_requests");

  const session = getActiveSession();
  const lateReqs = getLateRequests();
  const myPending = lateReqs.find((r) => r.studentId === currentUser!.uuid && r.status === "pending");
  const myLastReq = lateReqs.find((r) => r.studentId === currentUser!.uuid);

  // Watch for approval/denial of my late request
  const lastReqRef = useRef<string | null>(null);
  useEffect(() => {
    if (!myLastReq) return;
    if (lastReqRef.current === myLastReq.id) return;
    if (myLastReq.status === "approved") {
      // mark as Late
      const now = new Date();
      const rec: AttendanceRecord = {
        id: uuid(), userUuid: currentUser!.uuid, studentId: currentUser!.idNumber, studentName: currentUser!.name,
        subject: myLastReq.subject, timestamp: now.getTime(), date: toISO(now),
        time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
        status: "Late", confidence: myLastReq.faceConfidence, method: "face",
      };
      // dedupe — only if not already marked today for that subject
      if (!records.some((r) => r.date === rec.date && r.subject === rec.subject)) {
        addRecord(rec);
        toast.success("Late attendance approved");
      }
      lastReqRef.current = myLastReq.id;
    } else if (myLastReq.status === "denied") {
      toast.error("Late request denied");
      lastReqRef.current = myLastReq.id;
    }
  }, [myLastReq, addRecord, currentUser, records]);

  if (!session) return <WaitingForSession />;

  return <SessionActiveStudent
    session={session}
    addRecord={addRecord}
    records={records}
    pendingReq={myPending ?? null}
    navigate={navigate}
  />;
}

function WaitingForSession() {
  useReactiveStorage("preznt_active_session");
  return (
    <div className="mx-auto w-full max-w-md px-5 pt-10 text-center">
      <motion.div animate={{ scale: [1, 1.05, 1], opacity: [0.7, 1, 0.7] }} transition={{ repeat: Infinity, duration: 2.5 }}
        className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-primary/10 text-primary">
        <Hourglass className="h-10 w-10" />
      </motion.div>
      <h1 className="mt-6 text-2xl font-semibold">No active session</h1>
      <p className="mt-2 text-sm text-muted-foreground">Waiting for your professor to open the attendance session. This page refreshes automatically.</p>
      <div className="mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.6 }}>•</motion.span>
        Listening for session…
      </div>
    </div>
  );
}

function SessionActiveStudent({
  session, addRecord, records, pendingReq, navigate,
}: {
  session: ProfSession; addRecord: (r: AttendanceRecord) => void;
  records: AttendanceRecord[]; pendingReq: LateRequest | null;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { currentUser } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<ScanState>("loading");
  const [confidence, setConfidence] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [showQR, setShowQR] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRec, setLastRec] = useState<AttendanceRecord | null>(null);
  const [, setTick] = useState(0);

  // Live countdown
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = session.expiresAt - Date.now();
  const inLateWindow = Date.now() > session.lateDeadline;

  const todayISO = toISO(new Date());
  const alreadyMarked = records.find((r) => r.date === todayISO && r.subject === session.subject) ?? null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadFaceApi();
        if (cancelled) return;
        if (videoRef.current) streamRef.current = await startCamera(videoRef.current);
        if (!cancelled) setState("ready");
      } catch (e: any) {
        setError(e?.message ?? "Camera unavailable");
        setState("error");
      }
    })();
    return () => { cancelled = true; stopCamera(streamRef.current); };
  }, []);

  async function verify() {
    if (!currentUser || !videoRef.current) return;
    const stored = getFaceDescriptor(currentUser.uuid);
    if (!stored) {
      toast.error("No face enrolled. Please set up first.");
      navigate({ to: "/enroll" });
      return;
    }
    setState("verifying");
    setError(null);
    try {
      const faceapi = await loadFaceApi();
      const distances: number[] = [];
      for (let i = 0; i < 3; i++) {
        let d: Float32Array | null = null;
        for (let r = 0; r < 4 && !d; r++) {
          d = await detectDescriptor(faceapi, videoRef.current);
          if (!d) await new Promise((res) => setTimeout(res, 250));
        }
        if (!d) { setState("noface"); return; }
        distances.push(euclidean(stored, d));
        await new Promise((r) => setTimeout(r, 200));
      }
      const allMatch = distances.every((d) => d < 0.5);
      const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
      const conf = Math.max(0, Math.min(100, Math.round((1 - avgDist) * 100)));
      setConfidence(conf);
      if (allMatch && conf > 50) {
        const now = new Date();
        if (inLateWindow) {
          // request approval
          addLateRequest({
            id: uuid(), sessionId: session.id, studentId: currentUser.uuid,
            studentIdNumber: currentUser.idNumber,
            studentName: currentUser.name, subject: session.subject, timestamp: now.getTime(),
            faceConfidence: conf, status: "pending",
          });
          stopCamera(streamRef.current);
          setState("awaitingApproval");
          toast(`Late approval requested from ${session.professorName}`);
        } else {
          // Present
          const rec: AttendanceRecord = {
            id: uuid(), userUuid: currentUser.uuid, studentId: currentUser.idNumber, studentName: currentUser.name,
            subject: session.subject, timestamp: now.getTime(), date: toISO(now),
            time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
            status: "Present", confidence: conf, method: "face",
          };
          addRecord(rec);
          appendMarkLog({
            id: rec.id, studentID: currentUser.uuid, studentName: currentUser.name,
            studentIdNumber: currentUser.idNumber, subject: session.subject,
            professorID: session.professorId, professorName: session.professorName,
            sessionID: session.id, date: rec.date, timeMarked: rec.time,
            status: "Present", faceConfidence: conf,
          });
          setLastRec(rec);
          setState("matched");
          toast.success(`Marked Present — ${session.subject}`);
          stopCamera(streamRef.current);
          setTimeout(() => setState("done"), 1400);
        }
      } else {
        setState("nomatch");
        setFailCount((f) => {
          const next = f + 1;
          if (next >= 3) setShowQR(true);
          return next;
        });
      }
    } catch (e: any) {
      setError(e?.message ?? "Recognition failed");
      setState("error");
    }
  }

  if (state === "awaitingApproval" || (pendingReq && state !== "done")) {
    return (
      <div className="mx-auto w-full max-w-md px-5 pt-10 text-center">
        <motion.div animate={{ opacity: [0.6, 1, 0.6] }} transition={{ repeat: Infinity, duration: 1.8 }}
          className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-amber/15 text-amber">
          <Bell className="h-9 w-9" />
        </motion.div>
        <h1 className="mt-6 text-xl font-semibold">Waiting for professor approval…</h1>
        <p className="mt-2 text-sm text-muted-foreground">You're marking late. Your request was sent to {session.professorName}.</p>
      </div>
    );
  }

  if (state === "done" && lastRec) {
    const firstLogin = getFirstLoginDate(currentUser!.uuid) ?? toISO(new Date());
    const stats = computeAttendance(records.concat([lastRec]), firstLogin);
    return (
      <div className="mx-auto w-full max-w-md px-5 pt-10">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass-card rounded-3xl p-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/20 text-success">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-xl font-semibold">{lastRec.status} for {lastRec.subject}</h2>
          <div className="mt-1 text-sm text-muted-foreground">Marked at {lastRec.time} · {lastRec.confidence}% confidence</div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <Mini label="Present" value={stats.present} className="text-success" />
            <Mini label="Late" value={stats.late} className="text-amber" />
            <Mini label="Rate" value={`${stats.rate.toFixed(1)}%`} className="text-sand" />
          </div>
          <Link to="/records" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-medium text-primary-foreground">
            View in records <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-5 pt-6">
      <div className="label-eyebrow">Attendance</div>
      <h1 className="mt-1 text-2xl font-semibold">Mark yourself present</h1>

      <div className="mt-4 glass-card rounded-2xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="label-eyebrow">Session open for</div>
            <div className="mt-0.5 text-base font-semibold">{session.subject}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Started by {session.professorName} · {session.classTime}</div>
          </div>
          <div className="text-right">
            <div className="label-eyebrow">Closes in</div>
            <div className={`mt-0.5 font-mono text-lg ${inLateWindow ? "text-amber" : "text-success"}`}>{fmtCountdown(remaining)}</div>
            {inLateWindow && <div className="text-[10px] text-amber">Late window</div>}
          </div>
        </div>
      </div>

      {alreadyMarked ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card mt-4 rounded-3xl p-5">
          <div className="flex items-center gap-2 text-success"><CheckCircle2 className="h-5 w-5" /> Already marked</div>
          <div className="mt-2 text-sm">{alreadyMarked.subject} · {alreadyMarked.time} · {alreadyMarked.confidence}%</div>
          <Link to="/records" className="mt-4 inline-flex items-center gap-1 text-sm text-primary">View in records →</Link>
        </motion.div>
      ) : (
        <>
          <div className="mt-4 glass-card rounded-3xl p-4">
            <div className={`relative aspect-square w-full overflow-hidden rounded-2xl bg-black ${state === "nomatch" ? "ring-2 ring-destructive" : ""}`}>
              <video ref={videoRef} className="h-full w-full object-cover scale-x-[-1]" playsInline muted autoPlay />
              <div className="pointer-events-none absolute inset-6 rounded-full border-2 border-primary/60" />
              {state === "verifying" && <div className="scan-sweep pointer-events-none absolute inset-0" />}
              <AnimatePresence>
                {state === "matched" && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 grid place-items-center bg-success/30 backdrop-blur-sm">
                    <div className="text-center">
                      <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
                      <div className="mt-2 text-sm font-semibold text-white">Identity confirmed</div>
                      <div className="text-xs text-white/90">Match confidence: {confidence}%</div>
                    </div>
                  </motion.div>
                )}
                {state === "nomatch" && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-x-0 bottom-0 bg-destructive/80 p-3 text-center text-xs text-white">
                    Face not recognized
                  </motion.div>
                )}
                {state === "noface" && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-x-0 bottom-0 bg-black/70 p-3 text-center text-xs text-white">
                    No face detected — try better lighting
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <motion.button whileTap={{ scale: 0.97 }} onClick={verify}
              disabled={state === "loading" || state === "verifying" || state === "matched"}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {state === "loading" && <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</>}
              {state === "ready" && <><ScanFace className="h-4 w-4" /> Scan to mark {inLateWindow ? "Late" : "Present"}</>}
              {state === "verifying" && <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</>}
              {state === "matched" && <><CheckCircle2 className="h-4 w-4" /> Marked</>}
              {(state === "nomatch" || state === "noface" || state === "error") && <><RotateCw className="h-4 w-4" /> Try again</>}
            </motion.button>
            {error && <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
          </div>

          <button onClick={() => setShowQR((s) => !s)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card/40 py-3 text-sm font-medium text-muted-foreground hover:bg-card">
            <QrCode className="h-4 w-4" /> {showQR ? "Hide QR" : "Trouble scanning? Use QR"}
          </button>
          {showQR && <QRFallback subject={session.subject} onMarked={(rec) => { addRecord(rec); setLastRec(rec); setState("done"); }} />}
        </>
      )}
    </div>
  );
}

function Mini({ label, value, className = "" }: { label: string; value: number | string; className?: string }) {
  return (
    <div className="rounded-xl bg-card/60 p-2.5">
      <div className="label-eyebrow">{label}</div>
      <div className={`mt-0.5 text-base font-semibold ${className}`}>{value}</div>
    </div>
  );
}

function QRFallback({ subject, onMarked }: { subject: string; onMarked: (r: AttendanceRecord) => void }) {
  const { currentUser } = useAuth();
  const [dataUrl, setDataUrl] = useState<string>("");
  const [expiresAt] = useState(() => Date.now() + 5 * 60 * 1000);
  const [remaining, setRemaining] = useState(5 * 60);
  const tokenRef = useRef<string>(uuid());

  useEffect(() => {
    if (!currentUser) return;
    const payload = JSON.stringify({ studentId: currentUser.idNumber, subject, token: tokenRef.current, exp: expiresAt });
    QRCode.toDataURL(payload, { width: 240, margin: 1, color: { dark: "#0f0f0f", light: "#e8d5b7" } }).then(setDataUrl);
  }, [currentUser, subject, expiresAt]);

  useEffect(() => {
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setRemaining(s);
      if (s === 0) clearInterval(t);
    }, 500);
    return () => clearInterval(t);
  }, [expiresAt]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  // Note: attendance is written only by the professor after they scan this QR.
  // The student cannot self-confirm from this screen.
  void onMarked;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 glass-card rounded-3xl p-5 text-center">
      <div className="label-eyebrow">QR Code</div>
      <div className="mt-3 grid place-items-center">
        {dataUrl && <img src={dataUrl} alt="QR" width={240} height={240} className="rounded-2xl" />}
      </div>
      <div className="mt-3 text-xs text-muted-foreground">Expires in {mm}:{ss}</div>
      <div className="mt-4 rounded-2xl border border-border bg-card/40 px-3 py-3 text-xs text-muted-foreground">
        Hold this QR up to your professor. Attendance is marked from their device once they scan it — you cannot confirm it yourself.
      </div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// PROFESSOR SCAN — session controls + live feed + late approvals + reenroll approvals
// ──────────────────────────────────────────────────────────────────────
function ProfessorScan() {
  const { currentUser } = useAuth();
  useReactiveStorage("preznt_active_session");
  useReactiveStorage("preznt_late_requests");
  useReactiveStorage("preznt_reenroll_requests");
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((v) => v + 1), 1000); return () => clearInterval(t); }, []);

  const today = new Date();
  const todaySlots = slotsForDate(today).filter((s) => isTracked(s.subject) && (currentUser?.subjects ?? []).includes(s.subject));
  const [subject, setSubject] = useState<string>(todaySlots[0]?.subject ?? (currentUser?.subjects?.[0] ?? ""));
  const [classTime, setClassTime] = useState<string>(todaySlots[0] ? `${formatTime12(todaySlots[0].start)} – ${formatTime12(todaySlots[0].end)}` : "");

  const session = getActiveSession();
  const mine = session && session.professorId === currentUser!.uuid ? session : null;
  const lateReqs = getLateRequests().filter((r) => r.sessionId === mine?.id && r.status === "pending");
  const reenrollPending = getReenrollRequests().filter((r) => r.status === "pending");

  const allRecords = getAllStudentRecords();
  const liveList = mine ? allRecords
    .filter((r) => r.subject === mine.subject && r.timestamp >= mine.startedAt)
    .sort((a, b) => b.timestamp - a.timestamp) : [];

  function startSession() {
    if (!currentUser || !subject) return;
    const now = Date.now();
    const s: ProfSession = {
      id: uuid(), professorId: currentUser.uuid, professorName: currentUser.name,
      subject, classTime, startedAt: now,
      lateDeadline: now + 10 * 60 * 1000,
      expiresAt: now + 15 * 60 * 1000,
      isActive: true,
    };
    startSessionApi(s);
    toast.success(`Session opened — ${subject}`);
  }
  function closeSession() {
    endSession();
    toast("Session closed");
  }

  function approveLate(req: LateRequest) {
    updateLateRequest(req.id, { status: "approved" });
    if (mine) {
      const now = new Date();
      appendMarkLog({
        id: uuid(), studentID: req.studentId, studentName: req.studentName,
        studentIdNumber: req.studentIdNumber ?? req.studentId, subject: req.subject,
        professorID: mine.professorId, professorName: mine.professorName, sessionID: mine.id,
        date: toISO(now),
        timeMarked: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
        status: "Late", faceConfidence: req.faceConfidence,
      });
    }
    toast.success(`Approved ${req.studentName}`);
  }
  function denyLate(req: LateRequest) {
    updateLateRequest(req.id, { status: "denied" });
    toast(`Denied ${req.studentName}`);
  }

  function approveReenroll(id: string) {
    updateReenrollRequest(id, { status: "approved" });
    toast.success("Re-enrollment approved");
  }
  function denyReenroll(id: string) {
    updateReenrollRequest(id, { status: "denied" });
    toast("Re-enrollment denied");
  }

  function manualMarkById(studentId: string) {
    if (!mine) { toast.error("Start a session first"); return; }
    const id = studentId.trim();
    if (!id) return;
    const now = new Date();
    appendMarkLog({
      id: uuid(), studentID: id, studentName: id.toUpperCase(), studentIdNumber: id,
      subject: mine.subject, professorID: mine.professorId, professorName: mine.professorName,
      sessionID: mine.id, date: toISO(now),
      timeMarked: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      status: Date.now() > mine.lateDeadline ? "Late" : "Present", faceConfidence: 100,
    });
    setStudentInput("");
    toast.success(`Marked ${id}`);
  }
  const [studentInput, setStudentInput] = useState("");

  const remaining = mine ? mine.expiresAt - Date.now() : 0;

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6">
      <div className="label-eyebrow">Take attendance</div>
      <h1 className="mt-1 text-2xl font-semibold">Mark your class</h1>

      {/* Session controls */}
      {!mine ? (
        <div className="mt-4 glass-card rounded-3xl p-5 space-y-3">
          <div className="label-eyebrow">Open a new session</div>
          <div>
            <div className="label-eyebrow mb-1">Class</div>
            <select value={subject} onChange={(e) => {
              setSubject(e.target.value);
              const slot = todaySlots.find((s) => s.subject === e.target.value);
              if (slot) setClassTime(`${formatTime12(slot.start)} – ${formatTime12(slot.end)}`);
            }} className="input-bare w-full">
              {(todaySlots.length ? todaySlots : (currentUser?.subjects ?? []).map((s) => ({ subject: s, start: "", end: "" }))).map((s, i) => (
                <option key={i} value={s.subject}>{s.start ? `${formatTime12(s.start)} — ` : ""}{s.subject}</option>
              ))}
            </select>
          </div>
          <button onClick={startSession} disabled={!subject}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            <Play className="h-4 w-4" /> Start attendance session
          </button>
          <div className="text-xs text-muted-foreground">Session lasts 15 minutes. First 10 min = Present, next 5 = Late (needs approval).</div>
        </div>
      ) : (
        <div className="mt-4 glass-card rounded-3xl p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="label-eyebrow">Session active</div>
              <div className="mt-0.5 text-base font-semibold">{mine.subject}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{mine.classTime}</div>
            </div>
            <div className="text-right">
              <div className="label-eyebrow">Closes in</div>
              <div className="mt-0.5 font-mono text-2xl text-success">{fmtCountdown(remaining)}</div>
            </div>
          </div>
          <button onClick={closeSession} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card/60 py-2.5 text-sm font-medium">
            <Square className="h-4 w-4" /> Close session
          </button>
        </div>
      )}

      {/* Manual mark */}
      {mine && (
        <div className="mt-4 glass-card rounded-2xl p-4">
          <div className="label-eyebrow">Manual mark</div>
          <div className="mt-2 flex gap-2">
            <input value={studentInput} onChange={(e) => setStudentInput(e.target.value)} placeholder="Student ID (e.g. STU001)" className="input-bare flex-1" />
            <button onClick={() => { if (studentInput) { manualMarkById(studentInput); setStudentInput(""); } }} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Mark</button>
          </div>
        </div>
      )}

      {/* Late approvals */}
      {mine && lateReqs.length > 0 && (
        <div className="mt-6">
          <div className="label-eyebrow mb-2 flex items-center gap-2"><Bell className="h-3.5 w-3.5 text-amber" /> Late requests ({lateReqs.length})</div>
          <div className="space-y-2">
            {lateReqs.map((r) => (
              <motion.div key={r.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                className="glass-card flex items-center justify-between rounded-2xl p-3">
                <div>
                  <div className="text-sm font-semibold">{r.studentName}</div>
                  <div className="text-xs text-muted-foreground">{r.subject} · {new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {r.faceConfidence}%</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => approveLate(r)} className="rounded-xl bg-success/15 px-3 py-1.5 text-xs font-medium text-success"><ThumbsUp className="inline h-3 w-3 mr-1" />Approve</button>
                  <button onClick={() => denyLate(r)} className="rounded-xl bg-destructive/15 px-3 py-1.5 text-xs font-medium text-destructive"><ThumbsDown className="inline h-3 w-3 mr-1" />Deny</button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Re-enroll requests */}
      {reenrollPending.length > 0 && (
        <div className="mt-6">
          <div className="label-eyebrow mb-2">Face re-enrollment requests</div>
          <div className="space-y-2">
            {reenrollPending.map((r) => (
              <div key={r.id} className="glass-card flex items-center justify-between rounded-2xl p-3">
                <div>
                  <div className="text-sm font-semibold">{r.studentName}</div>
                  <div className="text-xs text-muted-foreground">{r.studentId} · {new Date(r.requestedAt).toLocaleString()}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => approveReenroll(r.id)} className="rounded-xl bg-success/15 px-3 py-1.5 text-xs font-medium text-success">Approve</button>
                  <button onClick={() => denyReenroll(r.id)} className="rounded-xl bg-destructive/15 px-3 py-1.5 text-xs font-medium text-destructive">Deny</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live list */}
      {mine && (
        <div className="mt-6">
          <div className="label-eyebrow mb-3 flex items-center gap-2"><Users className="h-3.5 w-3.5" /> Live — present in {mine.subject} ({liveList.length})</div>
          {liveList.length === 0 ? (
            <div className="glass-card rounded-2xl p-5 text-sm text-muted-foreground">No students marked yet. The list updates in real time.</div>
          ) : (
            <div className="space-y-2">
              {liveList.map((r) => (
                <motion.div key={r.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="glass-card flex items-center justify-between rounded-2xl p-3">
                  <div>
                    <div className="text-sm font-semibold">{r.studentName}</div>
                    <div className="text-xs text-muted-foreground">{r.studentId} · {r.time}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.status === "Late" ? "bg-amber/15 text-amber" : "bg-success/15 text-success"}`}>{r.status}</span>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
