#include "../CHCameraEffectMath.h"
#include <assert.h>
#include <stdio.h>

static bool near(double actual, double expected) {
  return fabs(actual - expected) < 0.0000001;
}

int main(void) {
  assert(CHEffectIntensity(-1) == 0);
  assert(CHEffectIntensity(2) == 1);
  assert(CHEffectIntensity(NAN) == 0);
  assert(CHEffectIntensity(INFINITY) == 0);
  assert(CHEffectIntensity(-INFINITY) == 0);
  assert(CHEffectIntensity(0.35) == 0.35);

  assert(CHImageOrientation(0) == 1);
  assert(CHImageOrientation(90) == 6);
  assert(CHImageOrientation(180) == 3);
  assert(CHImageOrientation(270) == 8);

  assert(CHLightingExposure(0.1, 0) == 0);
  assert(near(CHLightingExposure(0.1, 1), 0.72));
  assert(near(CHLightingExposure(1, 1), -0.12));
  assert(near(CHLightingExposure(0.58, 1), 0));
  assert(near(CHLightingExposure(0.1, 0.5), 0.36));
  assert(CHLightingExposure(NAN, 1) == 0);
  for (int step = 0; step <= 1000; step++) {
    double luminance = step / 1000.0;
    assert(CHLightingExposure(luminance, 1) >= -0.1200001);
    assert(CHLightingExposure(luminance, 1) <= 0.7200001);
  }

  assert(CHSubjectOffset(0.5) == 0);
  assert(CHSubjectOffset(0) == 1);
  assert(CHSubjectOffset(1) == -1);
  assert(CHSubjectOffset(-100) == 1);
  assert(CHSubjectOffset(100) == -1);
  assert(CHSubjectOffset(NAN) == 0);
  assert(near(CHSmooth(0, 1, 0.2), 0.2));
  assert(near(CHParallaxShift(1, 0.023, 1000, 1), 23));
  assert(near(CHParallaxShift(-1, 0.023, 1000, 1), -23));
  assert(CHParallaxShift(1, 0.023, 1000, 0) == 0);
  assert(CHParallaxShift(NAN, 0.023, 1000, 1) == 0);
  assert(CHParallaxShift(1, 100, 1000, 1) <= 23);
  // 4% overscan always covers the furthest layer's maximum 2.3% translation.
  for (int step = -100; step <= 100; step++) {
    assert(fabs(CHParallaxShift(step / 50.0, 0.023, 1080, 1)) < 1080 * 0.04);
  }

  assert(CHCreativeStrength(0) == 0);
  assert(CHCreativeStrength(0.25) == 0.5);
  assert(CHCreativeStrength(1) == 1);
  assert(CHCreativeStrength(NAN) == 0);
  assert(CHSpotlightPeriod >= 8);
  assert(near(CHSpotlightCenterX(0), CHSpotlightCenterX(CHSpotlightPeriod)));
  assert(near(CHSpotlightCenterY(0), CHSpotlightCenterY(CHSpotlightPeriod)));
  for (int frame = 0; frame <= 720; frame++) {
    double elapsed = frame / 30.0;
    double x = CHSpotlightCenterX(elapsed), y = CHSpotlightCenterY(elapsed);
    assert(x >= 0.219999 && x <= 0.780001);
    assert(y >= 0.339999 && y <= 0.700001);
    // Continuous at the cycle boundary; less than 0.5% width/frame at 30fps.
    assert(fabs(x - CHSpotlightCenterX(elapsed + 1.0 / 30.0)) < 0.005);
    assert(fabs(y - CHSpotlightCenterY(elapsed + 1.0 / 30.0)) < 0.005);
  }

  assert(CHSnapshotIsFresh(10.1, 10, 7, 7, 0.2));
  assert(!CHSnapshotIsFresh(10.3, 10, 7, 7, 0.2));
  assert(!CHSnapshotIsFresh(9.9, 10, 7, 7, 0.2));
  assert(!CHSnapshotIsFresh(10.1, 10, 8, 7, 0.2)); // Off invalidated queued inference.
  assert(!CHSnapshotIsFresh(10.1, 10, 9, 7, 0.2)); // Off then On cannot revive it.
  assert(!CHSnapshotIsFresh(NAN, 10, 7, 7, 0.2));
  assert(!CHSnapshotIsFresh(10.1, NAN, 7, 7, 0.2));

  puts("camera effect policy: intensity, orientation, exposure, parallax, creative strength, slow spotlight, freshness/generation passed");
  return 0;
}
