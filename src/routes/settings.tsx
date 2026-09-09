import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo } from "react";
import { LogOut, Moon, Sun, Camera, ChevronRight, ShieldCheck, HelpCircle, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";
import {
  useAuth, useTheme, hasFaceEnrolled,
  addReenrollRequest, latestReenrollFor, uuid, useReactiveStorage,
} from "@/lib/storage";
import { Avatar } from "@/components/app-shell";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — PREZNT" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { currentUser, logout, updateUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState(currentUser?.name ?? "");
  const [editing, setEditing] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [reenrollOpen, setReenrollOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  useReactiveStorage("preznt_reenroll_requests");

  const reenroll = useMemo(() => currentUser ? latestReenrollFor(currentUser.uuid) : null, [currentUser]);
  const enrolled = currentUser ? hasFaceEnrolled(currentUser.uuid) : false;

  if (!currentUser) return null;

  function saveProfile() {
    updateUser({ name });
    setEditing(false);
    toast.success("Profile updated");
  }
  function doLogout() {
    logout();
    setLogoutOpen(false);
    toast.success("Signed out");
    navigate({ to: "/auth" });
  }
  function requestReenroll() {
    if (!currentUser) return;
    if (reenroll && reenroll.status === "pending") { toast("Request already pending"); return; }
    if (reenroll && reenroll.status === "approved") { navigate({ to: "/enroll" }); return; }
    addReenrollRequest({
      id: uuid(),
      studentId: currentUser.idNumber,
      studentName: currentUser.name,
      requestedAt: Date.now(),
      status: "pending",
    });
    setReenrollOpen(false);
    toast.success("Request sent to professor");
  }
  function sendFeedback() {
    if (!feedback.trim()) return;
    toast.success("Thanks — feedback received");
    setFeedback("");
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 pt-6">
      <div className="label-eyebrow">Account</div>
      <h1 className="mt-1 text-3xl font-semibold">Settings</h1>

      {/* Profile */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card mt-6 rounded-3xl p-5">
        <div className="flex items-center gap-4">
          <Avatar name={currentUser.name} size={56} />
          <div className="min-w-0 flex-1">
            {editing ? (
              <input value={name} onChange={(e) => setName(e.target.value)} className="input-bare w-full" />
            ) : (
              <>
                <div className="truncate text-base font-semibold">{currentUser.name}</div>
                <div className="truncate text-xs text-muted-foreground">{currentUser.email}</div>
              </>
            )}
          </div>
          {editing ? (
            <button onClick={saveProfile} className="rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Save</button>
          ) : (
            <button onClick={() => setEditing(true)} className="rounded-xl border border-border bg-card/60 px-3 py-1.5 text-xs font-medium">Edit</button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <Tag label="ID" value={currentUser.idNumber} />
          <Tag label="Role" value={currentUser.role} />
        </div>
      </motion.div>

      {/* Face recognition */}
      {currentUser.role === "Student" && (
        <div className="mt-3 space-y-2">
          <div className="label-eyebrow">Face recognition</div>
          <button onClick={() => setReenrollOpen(true)} className="flex w-full items-center justify-between rounded-3xl bg-card/60 p-4 ring-1 ring-inset ring-white/5 transition hover:bg-card">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><Camera className="h-4 w-4" /></div>
              <div className="text-left">
                <div className="text-sm font-medium">Re-scan face</div>
                <div className="text-xs text-muted-foreground">Update your face data (requires professor approval)</div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className={`flex items-center gap-2 px-2 text-xs ${enrolled ? "text-success" : "text-muted-foreground"}`}>
            <ShieldCheck className="h-3.5 w-3.5" />
            {enrolled ? "Face enrolled" : "Not enrolled"}
            {reenroll && reenroll.status === "pending" && <span className="ml-auto text-amber">Request pending</span>}
            {reenroll && reenroll.status === "approved" && <span className="ml-auto text-success">Approved — tap to rescan</span>}
            {reenroll && reenroll.status === "denied" && <span className="ml-auto text-destructive">Last request denied</span>}
          </div>
        </div>
      )}

      {/* Appearance */}
      <div className="mt-5 label-eyebrow">Appearance</div>
      <div className="glass-card mt-2 flex items-center justify-between rounded-3xl p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
            {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </div>
          <div className="text-sm font-medium capitalize">{theme} mode</div>
        </div>
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className={`relative h-7 w-12 rounded-full transition ${theme === "dark" ? "bg-primary" : "bg-card ring-1 ring-inset ring-white/10"}`}>
          <motion.span layout className="absolute top-0.5 h-6 w-6 rounded-full bg-background shadow"
            style={{ left: theme === "dark" ? "calc(100% - 1.625rem)" : "0.125rem" }} />
        </button>
      </div>

      {/* Support */}
      <div className="mt-5 label-eyebrow">Support</div>
      <div className="mt-2 space-y-2">
        <button onClick={() => setHelpOpen((v) => !v)} className="flex w-full items-center justify-between rounded-3xl bg-card/60 p-4 ring-1 ring-inset ring-white/5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><HelpCircle className="h-4 w-4" /></div>
            <div className="text-sm font-medium">Help & FAQ</div>
          </div>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition ${helpOpen ? "rotate-90" : ""}`} />
        </button>
        <AnimatePresence>
          {helpOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="space-y-2 px-2 py-3 text-sm text-muted-foreground">
                <Faq q="Why do I see 'No active session'?" a="Your professor hasn't opened the attendance session yet. It refreshes automatically." />
                <Faq q="What's the late window?" a="0–10 min of session = Present. 10–15 min = Late (needs approval). After 15 min the session closes." />
                <Faq q="My face isn't recognized" a="Try better lighting. After 3 fails the QR fallback opens." />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="glass-card rounded-3xl p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><MessageSquare className="h-4 w-4" /></div>
            <div className="text-sm font-medium">Send feedback</div>
          </div>
          <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Tell us what could be better…" rows={3}
            className="mt-3 w-full rounded-2xl border border-border bg-background/40 p-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          <button onClick={sendFeedback} className="mt-2 w-full rounded-2xl bg-primary py-2.5 text-sm font-medium text-primary-foreground">Submit</button>
        </div>
      </div>

      {/* App info */}
      <div className="mt-6 text-center text-xs text-muted-foreground">
        PREZNT · v1.0.0<br />Be seen. Be Preznt.
      </div>

      {/* Account — log out (no Danger Zone label) */}
      <div className="mt-10 mb-6">
        <button onClick={() => setLogoutOpen(true)} className="flex w-full items-center justify-between rounded-3xl bg-card/60 p-4 ring-1 ring-inset ring-white/5 transition hover:bg-card">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><LogOut className="h-4 w-4" /></div>
            <div className="text-left">
              <div className="text-sm font-medium">Log out</div>
              <div className="text-xs text-muted-foreground">Sign out of this device</div>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Logout modal */}
      <Modal open={logoutOpen} onClose={() => setLogoutOpen(false)} title="Log out of PREZNT?">
        <p className="text-sm text-muted-foreground">You'll need to log in again to mark attendance.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={() => setLogoutOpen(false)} className="rounded-2xl border border-border bg-card/60 py-2.5 text-sm font-medium">Cancel</button>
          <button onClick={doLogout} className="rounded-2xl bg-primary py-2.5 text-sm font-medium text-primary-foreground">Log out</button>
        </div>
      </Modal>

      {/* Re-enroll modal */}
      <Modal open={reenrollOpen} onClose={() => setReenrollOpen(false)} title="Request face re-enrollment?">
        <p className="text-sm text-muted-foreground">
          This requires professor approval to prevent proxy attendance.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={() => setReenrollOpen(false)} className="rounded-2xl border border-border bg-card/60 py-2.5 text-sm font-medium">Cancel</button>
          <button onClick={requestReenroll} className="rounded-2xl bg-primary py-2.5 text-sm font-medium text-primary-foreground">
            {reenroll?.status === "approved" ? "Start re-scan" : "Send request"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Tag({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card/40 p-3">
      <div className="label-eyebrow">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button onClick={() => setOpen(!open)} className="block w-full rounded-xl bg-card/40 p-3 text-left">
      <div className="text-sm font-medium text-foreground">{q}</div>
      {open && <div className="mt-1 text-xs">{a}</div>}
    </button>
  );
}

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
          <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
            className="glass-card relative w-full max-w-sm rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <button onClick={onClose} className="absolute right-4 top-4 text-muted-foreground"><X className="h-4 w-4" /></button>
            <h3 className="text-lg font-semibold">{title}</h3>
            <div className="mt-2">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
