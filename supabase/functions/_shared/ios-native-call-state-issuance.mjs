// Optional incoming-wake capability, disabled unless the server flag is true.
const HOST = 'bmkkhihfbmsnnmcqkoly.supabase.co';
export async function issueOptionalIosCallStateObserver({enabled, admin, attempt,
  expiresAt, createCapability, randomUUID, sha256, setTimer = setTimeout, clearTimer = clearTimeout}) {
  if (enabled !== 'true') return {};
  const observerId = randomUUID(), capability = createCapability();
  let timer;
  try {
    const result = await Promise.race([
      Promise.resolve().then(async () => admin.rpc('whole_app_issue_ios_call_state_observer', {
        p_issuance_id: observerId, p_attempt_id: attempt.id,
        p_attempt_count: Number(attempt.attempt_count ?? 1), p_capability_hash: await sha256(capability),
      })),
      new Promise(resolve => {timer = setTimer(() => resolve(null), 1000);}),
    ]);
    const millis = Date.parse(expiresAt);
    if (!result || result.error || result.data?.observerId !== observerId ||
        !Number.isFinite(millis) || Date.parse(result.data.expiresAt) !== millis) return {};
    return {stateObserverVersion: 1, stateObserverId: observerId,
      stateObserverCapability: capability, stateObserverExpiresAtMillis: String(millis),
      stateObserverUrl: `wss://${HOST}/functions/v1/ios-native-call-state`};
  } catch {return {};} finally {clearTimer(timer);}
}
