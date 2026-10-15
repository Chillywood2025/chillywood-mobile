package expo.modules.chillywoodcameraeffects;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Runs the actual production lifecycle policy without Android or ML Kit. */
public final class CameraEffectsLifecyclePolicyTest {
  private static int assertions;

  public static void main(String[] args) throws Exception {
    nativeStateRequired(); suspensionRejectsLateConfigure(); foregroundNeedsExplicitConfigure();
    destructionIsTerminal(); configureAndCleanupAreSerialized();
    System.out.println("Camera lifecycle policy: " + assertions + " assertions passed");
  }

  private static void check(boolean condition, String message) {
    assertions++;
    if (!condition) throw new AssertionError(message);
  }

  private static final class Registry {
    final CameraEffectsLifecyclePolicy policy = new CameraEffectsLifecyclePolicy();
    int processors;

    boolean configure(boolean nativeResumed) {
      synchronized (policy) {
        if (!policy.allowsConfiguration(nativeResumed)) return false;
        processors++;
        return true;
      }
    }
    void background() {
      synchronized (policy) {
        policy.suspend();
        processors = 0;
      }
    }
    void foreground() {
      synchronized (policy) { policy.resume(); }
    }
    void destroy() {
      synchronized (policy) {
        policy.destroy();
        processors = 0;
      }
    }
  }

  private static void nativeStateRequired() {
    Registry registry = new Registry();
    check(!registry.configure(false), "initial background or absent Activity cannot configure");
    check(registry.processors == 0, "rejected initial configure creates no processor");
    check(registry.configure(true), "module created while native Activity is resumed can configure");
  }

  private static void suspensionRejectsLateConfigure() {
    Registry registry = new Registry();
    registry.configure(true);
    registry.background();
    check(registry.processors == 0, "background releases existing processors");
    check(!registry.configure(true), "late configure rejected even with stale foreground snapshot");
    check(!registry.configure(false), "background native state also rejects configure");
    check(registry.processors == 0, "late requests cannot recreate processors after cleanup");
  }

  private static void foregroundNeedsExplicitConfigure() {
    Registry registry = new Registry();
    registry.configure(true); registry.background(); registry.foreground();
    check(registry.processors == 0, "foreground does not automatically restart old processors");
    check(!registry.configure(false), "foreground event alone cannot override current native state");
    check(registry.configure(true), "explicit configure works after true native foreground");
    check(registry.processors == 1, "explicit rebind creates one processor");
  }

  private static void destructionIsTerminal() {
    Registry registry = new Registry();
    registry.configure(true); registry.destroy(); registry.foreground();
    check(!registry.configure(true), "foreground cannot reopen destroyed module");
    registry.background(); registry.foreground(); registry.destroy();
    check(!registry.configure(false), "destroy remains closed for background configuration");
    check(!registry.configure(true), "repeated lifecycle events cannot reopen terminal state");
    check(registry.processors == 0, "destroy leaves no registrations");
  }

  private static void configureAndCleanupAreSerialized() throws Exception {
    Registry registry = new Registry();
    CountDownLatch entered = new CountDownLatch(1), allowRegistration = new CountDownLatch(1);
    AtomicReference<Throwable> failure = new AtomicReference<>();
    Thread configure = new Thread(() -> {
      try {
        synchronized (registry.policy) {
          if (!registry.policy.allowsConfiguration(true)) throw new AssertionError("initial native state should be eligible");
          entered.countDown();
          if (!allowRegistration.await(5, TimeUnit.SECONDS)) throw new AssertionError("test configure timed out");
          registry.processors++;
        }
      } catch (Throwable error) { failure.set(error); }
    });
    Thread background = new Thread(registry::background);
    configure.start();
    check(entered.await(5, TimeUnit.SECONDS), "configure reached gated registration while holding native monitor");
    background.start(); allowRegistration.countDown();
    configure.join(5000); background.join(5000);
    check(!configure.isAlive() && !background.isAlive(), "serialized lifecycle operations terminate");
    if (failure.get() != null) throw new AssertionError("concurrent policy test failed", failure.get());
    check(registry.processors == 0, "background cleanup cannot be overtaken by previously admitted configure");
    check(!registry.configure(true), "late configure remains rejected after concurrent cleanup");
  }
}
