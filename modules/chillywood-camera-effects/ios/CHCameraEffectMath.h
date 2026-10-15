#ifndef CH_CAMERA_EFFECT_MATH_H
#define CH_CAMERA_EFFECT_MATH_H

#include <math.h>
#include <stdbool.h>
#include <stdint.h>

static inline double CHClamp(double value, double minimum, double maximum) {
  return fmin(maximum, fmax(minimum, value));
}

static inline double CHEffectIntensity(double intensity) {
  return isfinite(intensity) ? CHClamp(intensity, 0.0, 1.0) : 0.0;
}

// Core Image / EXIF orientation for WebRTC's clockwise rotation metadata.
// Mirroring is deliberately not inferred from the camera position: it belongs
// to the preview renderer, and outgoing source pixels must not be mirrored twice.
static inline uint32_t CHImageOrientation(int rotation) {
  switch (rotation) {
    case 90: return 6;  // right
    case 180: return 3; // down
    case 270: return 8; // left
    default: return 1; // up
  }
}

static inline double CHLightingExposure(double luminance, double intensity) {
  if (!isfinite(luminance)) return 0.0;
  // Keep the face's existing contrast and avoid whitening skin or clipping
  // bright faces. This is a bounded exposure adjustment, not face reshaping.
  double exposure = log2(0.58 / CHClamp(luminance, 0.05, 1.0));
  return CHClamp(exposure, -0.12, 0.72) * CHEffectIntensity(intensity);
}

static inline double CHSubjectOffset(double center) {
  return isfinite(center) ? CHClamp((0.5 - center) * 2.0, -1.0, 1.0) : 0.0;
}

static inline double CHSmooth(double previous, double current, double amount) {
  return previous + (current - previous) * CHClamp(amount, 0.0, 1.0);
}

static inline double CHParallaxShift(double offset, double layerRatio, double dimension, double intensity) {
  if (!isfinite(offset) || !isfinite(layerRatio) || !isfinite(dimension) || dimension <= 0) return 0;
  return CHClamp(offset, -1, 1) * CHClamp(layerRatio, 0, 0.023) * dimension * CHEffectIntensity(intensity);
}

// Stronger creative effects remain visible at 25%, without a discontinuity
// at zero. The caller still bypasses all processing at exactly zero.
static inline double CHCreativeStrength(double intensity) {
  return sqrt(CHEffectIntensity(intensity));
}

static const double CHSpotlightPeriod = 12.0;

static inline double CHSpotlightPhase(double elapsed) {
  if (!isfinite(elapsed) || elapsed < 0) return 0;
  return fmod(elapsed, CHSpotlightPeriod) * (6.283185307179586 / CHSpotlightPeriod);
}

static inline double CHSpotlightCenterX(double elapsed) {
  return 0.5 + 0.28 * sin(CHSpotlightPhase(elapsed));
}

static inline double CHSpotlightCenterY(double elapsed) {
  return 0.52 + 0.18 * cos(CHSpotlightPhase(elapsed));
}

static inline bool CHSnapshotIsFresh(double now, double capturedAt,
                                     uint64_t generation, uint64_t snapshotGeneration,
                                     double maxAge) {
  return generation == snapshotGeneration && isfinite(now) && isfinite(capturedAt)
    && now >= capturedAt && now - capturedAt <= maxAge;
}

#endif
