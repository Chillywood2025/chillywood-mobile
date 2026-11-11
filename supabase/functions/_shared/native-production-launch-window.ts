// Admission constrains entry into the SDK, not the time a pending Store charge
// settles. This interval uses server time and native-only monotonic elapsed.
// The caller must first authenticate the native proof/preparation identity.
export function nativeProductionLaunchWindow(input: {
  preparationId: string; storedPreparationId: string; serverReceivedAt: string;
  elapsedToLaunchMs: string; elapsedLimitMs: number; admissionExpiresMs: string;
  checkoutStartedAt: string;
}): { lowerMs: number; upperMs: number; elapsedMs: number } {
  if (input.preparationId !== input.storedPreparationId
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.preparationId)
    || !/^(0|[1-9][0-9]{0,5})$/.test(input.elapsedToLaunchMs)
    || !/^[0-9]{13}$/.test(input.admissionExpiresMs)) throw Error('native_launch_proof_invalid');
  const lowerMs = Date.parse(input.serverReceivedAt), elapsedMs = Number(input.elapsedToLaunchMs);
  const upperMs = lowerMs + elapsedMs, expiresMs = Number(input.admissionExpiresMs);
  const checkoutMs = Date.parse(input.checkoutStartedAt);
  if (!Number.isSafeInteger(lowerMs) || !Number.isSafeInteger(checkoutMs)
    || !Number.isSafeInteger(input.elapsedLimitMs) || input.elapsedLimitMs < 1 || input.elapsedLimitMs > 300000
    || elapsedMs >= input.elapsedLimitMs || !Number.isSafeInteger(upperMs)
    || upperMs < checkoutMs || upperMs >= expiresMs) throw Error('native_launch_window_invalid');
  return { lowerMs, upperMs, elapsedMs };
}
