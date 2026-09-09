// CDN loader for face-api.js
let loadingPromise: Promise<any> | null = null;
const FACE_API_SRC = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/dist/face-api.min.js";
const MODELS_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/";

export async function loadFaceApi(): Promise<any> {
  if (typeof window === "undefined") throw new Error("face-api browser only");
  if ((window as any).__faceapiReady && (window as any).faceapi) return (window as any).faceapi;
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
      const init = async () => {
        try {
          const faceapi = (window as any).faceapi;
          if (!faceapi) throw new Error("face-api missing");
          const tf = (window as any).tf || faceapi.tf;
          if (tf && typeof tf.ready === "function") {
            await tf.ready();
          }
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELS_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
          ]);
          (window as any).__faceapiReady = true;
          resolve(faceapi);
        } catch (e) { reject(e); }
      };
    const existing = document.querySelector("script[data-faceapi]") as HTMLScriptElement | null;
    if (existing) {
      if ((window as any).faceapi) init();
      else {
        existing.addEventListener("load", init);
        existing.addEventListener("error", () => reject(new Error("face-api script failed")));
      }
      return;
    }
    const s = document.createElement("script");
    s.src = FACE_API_SRC;
    s.async = true;
    s.dataset.faceapi = "true";
    s.onload = init;
    s.onerror = () => reject(new Error("face-api script failed"));
    document.head.appendChild(s);
  });
  return loadingPromise;
}

export async function detectDescriptor(faceapi: any, input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): Promise<Float32Array | null> {
  const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
  const res = await faceapi
    .detectSingleFace(input, opts)
    .withFaceLandmarks(true) // useTinyModel
    .withFaceDescriptor();
  return res?.descriptor ?? null;
}

export function euclidean(a: Float32Array | number[], b: Float32Array | number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a as any)[i] - (b as any)[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Start camera with iOS-Safari-friendly constraints */
export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  video.setAttribute("playsinline", "true");
  video.setAttribute("autoplay", "true");
  video.setAttribute("muted", "true");
  (video as any).playsInline = true;
  video.muted = true;
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  try { await video.play(); } catch { /* will retry on user gesture */ }
  return stream;
}

export function stopCamera(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
}
