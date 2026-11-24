// Central configuration. Clinician-editable values live in DEFAULT_PROTOCOL and
// can be overridden per patient from the clinician page (dashboard.html).

export const APP_NAME = 'Gamified Post-Op Physical Therapy';

export const XP = {
  good: 10,          // rep at target, held, no form faults
  ok: 6,             // rep completed but with a form fault
  partial: 2,        // honest attempt that fell short
  exerciseBonus: 20, // finishing all prescribed reps
  perLevel: 100,
};

export const DEFAULT_PROTOCOL = {
  side: 'auto',        // 'auto' | 'left' | 'right'  (operated leg)
  painStopsAfter: 2,   // nth pain report in a session stops it and alerts the clinician
  exercises: {
    kneeExtension: { enabled: true, reps: 3, target: 165, easierTarget: 150, holdSec: 2, easierHoldSec: 1 },
    miniSquat:     { enabled: true, reps: 3, target: 130, easierTarget: 145, holdSec: 1, easierHoldSec: 1, safetyLimit: 100 },
  },
};

// MediaPipe assets. If scripts/fetch-offline.ps1 has been run, the local copies
// in vendor/mediapipe are used instead (works without internet).
export const MEDIAPIPE = {
  cdn: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14',
  model: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  localDir: 'vendor/mediapipe',
};
