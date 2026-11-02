type RealtimeDisconnect = {
  disconnect(code?: number, reason?: string): Promise<'ok' | 'timeout'>;
  connectionState?: () => string;
  socketAdapter?: unknown;
};
type Observer = { pending: Promise<void> | null; active: number; failed: boolean; read: () => Promise<void> | null };
const observers = new WeakMap<RealtimeDisconnect, Observer>();

// The pinned SDK's timeout does not cancel Phoenix teardown. Public "closed"
// describes native readyState, not whether Phoenix detached the old connection
// and ran its completion callback. Read-only qualification must establish both.
// An SDK shape change fails closed rather than guessing or forcing disconnect.
function confirmedDetached(realtime: RealtimeDisconnect): boolean {
  try {
    const adapter = realtime.socketAdapter;
    if (!adapter || typeof adapter !== 'object' || !('getSocket' in adapter) || typeof adapter.getSocket !== 'function') return false;
    const socket: unknown = adapter.getSocket();
    return realtime.connectionState?.() === 'closed' && !!socket && typeof socket === 'object'
      && 'conn' in socket && socket.conn === null
      && 'disconnecting' in socket && socket.disconnecting === false;
  } catch { return false; }
}

/** Observe existing SDK teardown; never initiate a disconnect or remove a peer.
 * The SDK's removeChannel resolves before its last-channel disconnect promise.
 * Capture that promise at client construction, including buffered-send drain.
 */
export function observeRealtimeDisconnect(realtime: RealtimeDisconnect): () => Promise<void> | null {
  const existing = observers.get(realtime);
  if (existing) return existing.read;
  const observer: Observer = { pending: null, active: 0, failed: false, read: () => {
    // A late SDK callback can finish after its timeout. A future foreground or
    // account generation may recover only after actual detached-idle proof.
    if (!observer.active && observer.failed && confirmedDetached(realtime)) {
      observer.failed = false;
      observer.pending = null;
    }
    return observer.pending;
  } };
  const disconnect = realtime.disconnect;
  realtime.disconnect = function (...args) {
    const result = disconnect.apply(this, args);
    observer.active += 1;
    const operation = result.then(status => {
      if (status !== 'ok') throw new Error('realtime_disconnect_unconfirmed');
    }).catch(error => {
      observer.failed = true;
      throw error;
    }).finally(() => {
      observer.active -= 1;
    });
    // A redundant SDK disconnect may return immediate "ok" while an earlier
    // native close is still pending. It must not replace that earlier barrier.
    // Drain every outstanding operation even after one rejects. A settled
    // failure must not poison every later successful teardown by inheritance.
    const pending = Promise.allSettled([observer.pending, operation]).then(() => {
      if (!observer.active) {
        if (observer.failed && !confirmedDetached(realtime)) throw new Error('realtime_disconnect_unconfirmed');
        observer.failed = false;
      }
    });
    observer.pending = pending;
    void pending.then(() => {
      if (observer.pending === pending) observer.pending = null;
    }, () => {
      // Keep unconfirmed teardown closed; a later confirmed callback/lifecycle
      // can recover. Never force a global disconnect and disrupt Chat/media.
    });
    return result;
  };
  observers.set(realtime, observer);
  return observer.read;
}
