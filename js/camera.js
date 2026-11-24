// Camera handling, tuned to show as much of the room as possible:
// - ask for the sensor's native 4:3 shape (asking for 16:9 makes phones crop
//   the top and bottom of the picture, which "zooms in")
// - set hardware zoom to its minimum where the browser exposes it
// - let the user cycle through all cameras (back and ultra-wide see far more)

const SHAPE = { width: { ideal: 1280 }, height: { ideal: 960 }, aspectRatio: { ideal: 4 / 3 } };

async function getStream(selector) {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { ...SHAPE, ...selector }, audio: false });
  } catch (err) {
    if (err.name !== 'OverconstrainedError') throw err;
    return navigator.mediaDevices.getUserMedia({ video: selector, audio: false });
  }
}

function zoomRange(track) {
  const caps = track.getCapabilities?.();
  if (!caps?.zoom || !(caps.zoom.max > caps.zoom.min)) return null;
  return { min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 };
}

export async function setZoom(track, value) {
  try {
    await track.applyConstraints({ advanced: [{ zoom: value }] });
  } catch (err) {
    console.warn('Zoom not applied', err);
  }
}

/**
 * Opens a camera. Pass { deviceId } for a specific one, otherwise the front camera.
 * Returns { stream, track, deviceId, label, front, zoom } where zoom is null or {min, max, step}.
 */
export async function openCamera({ deviceId } = {}) {
  const stream = await getStream(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' });
  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings?.() ?? {};
  const label = track.label || '';
  const front = settings.facingMode
    ? settings.facingMode === 'user'
    : !/back|rear|environment/i.test(label);
  const zoom = zoomRange(track);
  if (zoom) await setZoom(track, zoom.min); // widest view the hardware allows
  return { stream, track, deviceId: settings.deviceId ?? deviceId, label, front, zoom };
}

export async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'videoinput');
}

/** Short, friendly name for the on-screen message after switching. */
export function cameraName(cam) {
  if (/ultra ?wide/i.test(cam.label)) return 'Ultra-wide camera';
  return cam.front ? 'Front camera' : 'Back camera';
}
