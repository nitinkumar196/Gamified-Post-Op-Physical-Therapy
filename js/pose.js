// Wrapper around MediaPipe Pose Landmarker (runs fully on-device).
import { MEDIAPIPE } from './config.js';

let landmarker = null;
let loading = null;

async function exists(url) {
  try { return (await fetch(url, { method: 'HEAD' })).ok; } catch { return false; }
}

export function initPose(onStatus = () => {}) {
  if (landmarker) return Promise.resolve(landmarker);
  loading ??= (async () => {
    const localBundle = `${MEDIAPIPE.localDir}/vision_bundle.mjs`;
    const local = await exists(localBundle);
    onStatus(local ? 'Loading pose model (offline copy)…' : 'Loading pose model…');

    const vision = await import(local ? new URL(localBundle, location.href).href : `${MEDIAPIPE.cdn}/vision_bundle.mjs`);
    const wasmPath = local ? new URL(`${MEDIAPIPE.localDir}/wasm`, location.href).href : `${MEDIAPIPE.cdn}/wasm`;
    const localModel = `${MEDIAPIPE.localDir}/pose_landmarker_lite.task`;
    const model = (await exists(localModel)) ? localModel : MEDIAPIPE.model;

    const fileset = await vision.FilesetResolver.forVisionTasks(wasmPath);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: model, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      landmarker = await vision.PoseLandmarker.createFromOptions(fileset, options('GPU'));
    } catch (err) {
      console.warn('GPU delegate failed, falling back to CPU', err);
      landmarker = await vision.PoseLandmarker.createFromOptions(fileset, options('CPU'));
    }
    onStatus('');
    return landmarker;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

let lastTs = 0;
/** Returns 33 normalised landmarks ({x, y, z, visibility}) or null. */
export function detectPose(video, now) {
  if (!landmarker) return null;
  const ts = Math.max(now, lastTs + 1); // timestamps must strictly increase
  lastTs = ts;
  const result = landmarker.detectForVideo(video, ts);
  return result.landmarks?.[0] ?? null;
}

/** Normalised landmarks → pixel points {x, y, v}, optionally mirrored for selfie view. */
export function toPixels(landmarks, w, h, mirror) {
  return landmarks.map((p) => ({
    x: (mirror ? 1 - p.x : p.x) * w,
    y: p.y * h,
    v: p.visibility ?? 1,
  }));
}
