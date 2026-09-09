import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail, Lock, User, GraduationCap, Briefcase, IdCard } from "lucide-react";
import { signInWithEmail, signUpWithEmail, useAuth, COLLEGE_DOMAIN } from "@/lib/storage";
import { TRACKED_SUBJECTS } from "@/lib/subjects";
import { shortLabel } from "@/lib/subjects";
import { Wordmark } from "@/components/app-shell";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — PREZNT" },
      { name: "description", content: `Sign in to PREZNT with your @${COLLEGE_DOMAIN} college email.` },
      { property: "og:title", content: "PREZNT — Sign in" },
      { property: "og:description", content: "Facial-recognition attendance for students and professors." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");

  useEffect(() => {
    if (!loading && session) navigate({ to: "/" });
  }, [session, loading, navigate]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center">
        <Wordmark className="text-3xl" />
        <p className="mt-2 text-xs text-muted-foreground">Be seen. Be Preznt.</p>
      </motion.div>

      <div className="mt-8 grid grid-cols-2 gap-1 rounded-2xl bg-card/60 p-1">
        <button onClick={() => setMode("signin")}
          className={`rounded-xl py-2 text-sm font-medium transition ${mode === "signin" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
          Log in
        </button>
        <button onClick={() => setMode("signup")}
          className={`rounded-xl py-2 text-sm font-medium transition ${mode === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
          Sign up
        </button>
      </div>

      <div className="mt-4 glass-card rounded-3xl p-5">
        {mode === "signin" ? <SignInForm /> : <SignUpForm onDone={() => setMode("signin")} />}
      </div>

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        Only <span className="text-foreground">@{COLLEGE_DOMAIN}</span> college emails can sign up.
      </p>
    </div>
  );
}

function SignInForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithEmail(email.trim().toLowerCase(), password);
      toast.success("Welcome back");
      navigate({ to: "/" });
    } catch (err: any) {
      setError(err?.message ?? "Invalid email or password");
      setShake((s) => s + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.form
      onSubmit={submit}
      className="space-y-3"
      key={shake}
      animate={shake ? { x: [0, -10, 10, -7, 7, 0] } : {}}
      transition={{ duration: 0.4 }}
    >
      <Field icon={Mail} type="email" placeholder={`you@${COLLEGE_DOMAIN}`} value={email} onChange={setEmail} autoComplete="email" required />
      <Field icon={Lock} type="password" placeholder="Password" value={password} onChange={setPassword} autoComplete="current-password" required minLength={6} />
      {error && <div className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
      <button type="submit" disabled={busy}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Logging in…</> : "Log in"}
      </button>
    </motion.form>
  );
}

function SignUpForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [role, setRole] = useState<"student" | "professor">("student");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);


  function toggleSubject(s: string) {
    setSubjects((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const emailNormalized = email.trim().toLowerCase();
    if (!emailNormalized.endsWith(`@${COLLEGE_DOMAIN}`)) {
      toast.error("Please use your college email ID to sign up.");
      return;
    }
    if (role === "professor" && subjects.length === 0) {
      toast.error("Select at least one subject you teach");
      return;
    }
    setBusy(true);
    try {
      await signUpWithEmail({
        email: emailNormalized,
        password,
        name: name.trim(),
        idNumber: idNumber.trim(),
        role,
        subjects: role === "professor" ? subjects : TRACKED_SUBJECTS,
      });
      toast.success("Account created — welcome to PREZNT");
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err?.message ?? "Sign-up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field icon={User} placeholder="Full name" value={name} onChange={setName} autoComplete="name" required />
      <Field icon={Mail} type="email" placeholder={`you@${COLLEGE_DOMAIN}`} value={email} onChange={setEmail} autoComplete="email" required />
      <Field icon={Lock} type="password" placeholder="Password (min 8 chars)" value={password} onChange={setPassword} autoComplete="new-password" required minLength={8} />
      <div>
        <div className="label-eyebrow mb-2">I am a</div>
        <div className="grid grid-cols-2 gap-2">
          <RolePick active={role === "student"} onClick={() => setRole("student")} icon={GraduationCap} label="Student" />
          <RolePick active={role === "professor"} onClick={() => setRole("professor")} icon={Briefcase} label="Professor" />
        </div>
      </div>
      <Field icon={IdCard} placeholder={role === "student" ? "Student ID (e.g. 23r11a0525)" : "Faculty ID"} value={idNumber} onChange={setIdNumber} required />

      {role === "professor" && (
        <div>
          <div className="label-eyebrow mb-2">Subjects you teach</div>
          <div className="flex flex-wrap gap-2">
            {TRACKED_SUBJECTS.map((s) => (
              <button key={s} type="button" onClick={() => toggleSubject(s)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
                  subjects.includes(s) ? "bg-primary text-primary-foreground" : "bg-card/60 text-muted-foreground"
                }`}>
                {shortLabel(s)}
              </button>
            ))}
          </div>
        </div>
      )}

      <button type="submit" disabled={busy}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : "Create account"}
      </button>
    </form>
  );
}

type FieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  icon: any;
  value: string;
  onChange: (v: string) => void;
};

function Field({ icon: Icon, value, onChange, ...rest }: FieldProps) {
  return (
    <label className="flex items-center gap-2 rounded-2xl border border-border bg-background/40 px-3.5 py-3 focus-within:ring-2 focus-within:ring-primary/40">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <input {...rest} value={value} onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70" />
    </label>
  );
}

function RolePick({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-xs font-medium transition ${active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card/40 text-muted-foreground"}`}>
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
