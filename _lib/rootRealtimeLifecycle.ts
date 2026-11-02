import type { RealtimeChannel } from '@supabase/supabase-js';
import { getRealtimeDisconnectBarrier, supabase } from './supabase';

// Only the app-owned notification/callee transports participate. Other Chat,
// room and media owners are never removed or disconnected by this coordinator.
const removals = new Map<RealtimeChannel, Promise<void>>();
const RECOVERY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000] as const;

export function retireRootRealtimeChannel(channel: RealtimeChannel) {
  const existing = removals.get(channel);
  if (existing) return existing;
  const pending = supabase.removeChannel(channel).then(() => {}, () => {}).finally(() => {
    if (removals.get(channel) === pending) removals.delete(channel);
  });
  removals.set(channel, pending);
  return pending;
}

/** Wait for owned channel retirement AND actual SDK socket teardown. The latter
 * outlives removeChannel, including the native socket's buffered OPEN phase.
 * Owners cancel their own wait; no global connect/disconnect monkeypatch. */
export function startAfterRootRealtimeRetirement(current: () => boolean, start: () => void) {
  let cancelled = false;
  let started = false;
  let recoveryAttempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ownsWait = () => !cancelled && !started && current();
  const recover = () => {
    if (!ownsWait()) return;
    // A timed-out SDK close can complete later. Recheck only its observed
    // retirement proof with a finite budget; never manufacture readiness.
    const delay = RECOVERY_DELAYS_MS[recoveryAttempt++];
    if (delay === undefined) return;
    timer = setTimeout(() => { timer = undefined; check(); }, delay);
  };
  const check = () => {
    if (!ownsWait()) return;
    try {
      const transport = getRealtimeDisconnectBarrier();
      if (removals.size || transport) {
        void Promise.all([...removals.values(), transport]).then(check, recover);
        return;
      }
      start();
      started = true;
    } catch {
      // Deferred subscription setup must not become an unhandled rejection.
      // The caller retires any partially created channel before retrying.
      recover();
    }
  };
  check();
  return () => {
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
}
