const normalizeText = (value) => String(value ?? "").trim();

export const ROLLBACK_TO_EMBEDDED_ACTIVATION_KEY = "rollback-to-embedded";

/**
 * @param {{
 *   currentUpdateId?: string | null;
 *   downloadedUpdateId?: string | null;
 *   inFlightActivationKey?: string | null;
 *   isEmbeddedLaunch?: boolean;
 *   isRollbackToEmbedded?: boolean;
 *   isUpdatePending?: boolean;
 * }} [input]
 * @returns {string | null}
 */
export function resolvePendingRuntimeUpdateActivationKey({
  currentUpdateId = null,
  downloadedUpdateId = null,
  inFlightActivationKey = null,
  isEmbeddedLaunch = false,
  isRollbackToEmbedded = false,
  isUpdatePending = false,
} = {}) {
  if (isUpdatePending !== true) return null;

  const current = normalizeText(currentUpdateId);
  const inFlight = normalizeText(inFlightActivationKey);
  const activationKey = isRollbackToEmbedded
    ? ROLLBACK_TO_EMBEDDED_ACTIVATION_KEY
    : normalizeText(downloadedUpdateId);

  if (!activationKey) return null;
  if (activationKey === ROLLBACK_TO_EMBEDDED_ACTIVATION_KEY && isEmbeddedLaunch === true) return null;
  if (activationKey !== ROLLBACK_TO_EMBEDDED_ACTIVATION_KEY && activationKey === current) return null;
  if (activationKey === inFlight) return null;

  return activationKey;
}

/**
 * @param {{
 *   currentUpdateId?: string | null;
 *   fetchedUpdateId?: string | null;
 *   inFlightActivationKey?: string | null;
 *   isEmbeddedLaunch?: boolean;
 *   isRollbackToEmbedded?: boolean;
 * }} [input]
 * @returns {string | null}
 */
export function resolveFetchedRuntimeUpdateActivationKey({
  currentUpdateId = null,
  fetchedUpdateId = null,
  inFlightActivationKey = null,
  isEmbeddedLaunch = false,
  isRollbackToEmbedded = false,
} = {}) {
  return resolvePendingRuntimeUpdateActivationKey({
    currentUpdateId,
    downloadedUpdateId: fetchedUpdateId,
    inFlightActivationKey,
    isEmbeddedLaunch,
    isRollbackToEmbedded,
    isUpdatePending: true,
  });
}
