package expo.modules.chillywoodcameraeffects;

/**
 * Native lifecycle eligibility. Use this instance as the monitor around BOTH
 * policy decisions and processor registry mutations, so cleanup cannot race a
 * configure that already passed the gate. Resuming never recreates processors.
 */
public final class CameraEffectsLifecyclePolicy {
  private boolean suspended;
  private boolean destroyed;

  public synchronized boolean allowsConfiguration(boolean nativeActivityResumed) {
    return nativeActivityResumed && !suspended && !destroyed;
  }

  public synchronized void suspend() { suspended = true; }

  public synchronized void resume() {
    if (!destroyed) suspended = false;
  }

  public synchronized void destroy() {
    destroyed = true;
    suspended = true;
  }
}
