import {setTimeout as delay} from 'node:timers/promises';

// Diagnostics for owned disposable-clone sessions only. A child exit or an
// unexpected marker is never evidence that the intended schedule succeeded.
export async function waitForNativeSessionMarker(session, marker, {
  timeoutMs = 20000, intervalMs = 25, inspect = () => null,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  // The last split item is an unterminated stream fragment. It may still grow
  // from RECEIPT_1 into RECEIPT_10, even when its current bytes equal the marker.
  const matched = () => session.output().split(/\r?\n/u).slice(0, -1).some(line => line.trim() === marker);
  let reason = 'marker deadline expired';
  while (Date.now() < deadline) {
    if (matched()) return;
    if (session.child.exitCode !== null || session.child.signalCode != null) {
      reason = 'backend exited without the exact marker';
      break;
    }
    await delay(intervalMs);
  }
  if (matched()) return;
  let backend;
  try { backend = inspect(); } catch (error) { backend = {inspectionError: String(error.message)}; }
  throw new Error(`Native session marker failed: ${reason}; ${JSON.stringify({
    marker, exitCode: session.child.exitCode, signalCode: session.child.signalCode,
    stdout: session.output().slice(-8000), stderr: session.errors().slice(-8000), backend,
  })}`);
}
