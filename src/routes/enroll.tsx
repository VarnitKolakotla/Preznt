import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth, setFaceDescriptor, hasFaceEnrolled, latestReenrollFor, updateReenrollRequest } from "@/lib/storage";
import { loadFaceApi, detectDescriptor, startCamera, stopCamera } from "@/lib/face-api";
import { Wordmark } from "@/components/app-shell";

export const Route = createFileRoute("/enroll")({
  head: () => ({ meta: [{ title: "Set up face — PREZNT" }] }),
  component: EnrollPage,
});

const FRAMES = 5;

function EnrollPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "scanning" | "success" | "error">("loading");
  const [captured, setCaptured] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Gate: if already enrolled and no approved re-enroll, send home
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role !== "Student") { navigate({ to: "/" }); return; }
    if (hasFaceEnrolled(currentUser.uuid)) {
      const req = latestReenrollFor(currentUser.uuid);
      if (!req || req.status !== "approved") {
        toast.error("Face re-enrollment needs professor approval");
        navigate({ to: "/settings" });
      }
    }
  }, [currentUser, navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadFaceApi();
        if (cancelled) return;
        if (videoRef.current) {
          streamRef.current = await startCamera(videoRef.current);
        }
        if (!cancelled) setStatus("ready");
      } catch (e: any) {
        setError(e?.message ?? "Camera not available");
        setStatus("error");
      }
    })();
    return () => { cancelled = true; stopCamera(streamRef.current); };
  }, []);

  async function runEnrollment() {
    if (!currentUser || !videoRef.current) return;
    setStatus("scanning");
    setCaptured(0);
    setError(null);
    try {
      const faceapi = await loadFaceApi();
      const descriptors: Float32Array[] = [];
      let attempts = 0;
      while (descriptors.length < FRAMES && attempts < FRAMES * 4) {
        attempts++;
        const d = await detectDescriptor(faceapi, videoRef.current);
        if (d) {
          descriptors.push(d);
          setCaptured(descriptors.length);
          await new Promise((r) => setTimeout(r, 350));
        } else {
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      if (descriptors.length < FRAMES) throw new Error("No face found — make sure you're in good light");

      // Average
      const avg = new Float32Array(descriptors[0].length);
      for (const d of descriptors) for (let i = 0; i < d.length; i++) avg[i] += d[i];
      for (let i = 0; i < avg.length; i++) avg[i] /= descriptors.length;

      setFaceDescriptor(currentUser.uuid, avg);
      const req = latestReenrollFor(currentUser.uuid);
      if (req && req.status === "approved") updateReenrollRequest(req.id, { status: "denied" }); // consume
      setStatus("success");
      toast.success("Face updated successfully");
      setTimeout(() => {
        stopCamera(streamRef.current);
        navigate({ to: "/" });
      }, 1500);
    } catch (e: any) {
      setError(e?.message ?? "Enrollment failed");
      setStatus("error");
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-10">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center">
        <Wordmark className="text-2xl" />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 text-center">
        <h1 className="text-2xl font-semibold">Set up face recognition</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We need to scan your face once so PREZNT can recognize you.
        </p>
      </motion.div>

      <div className="mt-6 glass-card rounded-3xl p-4">
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} className="h-full w-full object-cover scale-x-[-1]" playsInline muted autoPlay />
          <div className="pointer-events-none absolute inset-6 rounded-full border-2 border-primary/60" />
          <AnimatePresence>
            {status === "scanning" && (
              <motion.div
                initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white backdrop-blur"
              >
                Scanning… {captured}/{FRAMES}
              </motion.div>
            )}
            {status === "success" && (
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="absolute inset-0 grid place-items-center bg-success/30 backdrop-blur-sm"
              >
                <div className="flex flex-col items-center gap-2 text-center">
                  <CheckCircle2 className="h-14 w-14 text-success" />
                  <div className="text-sm font-medium text-white">Face registered!</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
          <li>• Look straight at the camera</li>
          <li>• Make sure your face is well lit</li>
          <li>• Hold still for 2 seconds</li>
        </ul>

        {error && (
          <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        )}

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={runEnrollment}
          disabled={status === "loading" || status === "scanning" || status === "success"}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition disabled:opacity-60"
        >
          {status === "loading" && <><Loader2 className="h-4 w-4 animate-spin" /> Loading camera…</>}
          {status === "ready" && <><Camera className="h-4 w-4" /> Start scanning</>}
          {status === "scanning" && <><Loader2 className="h-4 w-4 animate-spin" /> Capturing {captured}/{FRAMES}</>}
          {status === "success" && <><CheckCircle2 className="h-4 w-4" /> All set</>}
          {status === "error" && <><RotateCw className="h-4 w-4" /> Retry</>}
        </motion.button>
      </div>
    </div>
  );
}
