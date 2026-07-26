const nonNegativeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export const normalizeSanitizedObservabilityExport = (value, expectedPlatform) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { readbackComplete: false, reason: "sanitized_export_invalid" };
  }
  const platform = String(value.platform ?? "").trim().toLowerCase();
  if (platform !== expectedPlatform || value.readbackComplete !== true) {
    return { readbackComplete: false, reason: platform && platform !== expectedPlatform ? "sanitized_export_platform_mismatch" : "sanitized_export_incomplete" };
  }
  return {
    readbackComplete: true,
    platform,
    nativeCrashCount: nonNegativeNumber(value.nativeCrashCount),
    jsFatalCount: nonNegativeNumber(value.jsFatalCount),
    startupFailureCount: nonNegativeNumber(value.startupFailureCount),
    performanceRegressionCount: nonNegativeNumber(value.performanceRegressionCount),
    analyticsDeliveryFailureCount: nonNegativeNumber(value.analyticsDeliveryFailureCount),
    errorRatePercent: nonNegativeNumber(value.errorRatePercent),
    crashlyticsReadbackComplete: value.crashlyticsReadbackComplete === true,
    performanceReadbackComplete: value.performanceReadbackComplete === true,
    analyticsReadbackComplete: value.analyticsReadbackComplete === true,
  };
};

