package expo.modules.chillywoodteststore;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.Arrays;
import java.util.HashSet;
import java.util.function.BooleanSupplier;

/** Native process lifetime gate; no reset/reconfigure/key parameter is exposed. */
public final class TestStoreAdmissionPolicy {
  public static final String APPLICATION_ID = "com.chillywood.mobile.teststoredebug";
  private static final Set<String> KEYS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList("protocol", "mode", "platform", "applicationId", "projectId", "appId", "publicSdkKey", "configId", "storageNamespace")));
  private static boolean attempted;
  private static String ownedUser;
  private TestStoreAdmissionPolicy() {}
  public static Map<String, String> snapshot(boolean compiledDebug, boolean appDebuggable, String applicationId, Map<String, String> config) {
    if (!compiledDebug || !appDebuggable || !APPLICATION_ID.equals(applicationId) || config == null || !config.keySet().equals(KEYS)
        || !"isolated-test-store-build-v1".equals(config.get("protocol")) || !"test-store-debug".equals(config.get("mode"))
        || !"android".equals(config.get("platform")) || !APPLICATION_ID.equals(config.get("applicationId"))
        || !"@chillywood/test-store-debug-v1".equals(config.get("storageNamespace"))
        || !matches(config.get("projectId"), "[A-Za-z0-9_-]{4,100}") || !matches(config.get("appId"), "[A-Za-z0-9_-]{4,100}")
        || !matches(config.get("publicSdkKey"), "test_[A-Za-z0-9_-]{8,200}") || !matches(config.get("configId"), "[a-f0-9]{64}")) return null;
    return Collections.unmodifiableMap(new HashMap<>(config));
  }
  public static synchronized Map<String, String> configure(boolean compiledDebug, boolean appDebuggable, String applicationId,
      Map<String, String> config, String user, BooleanSupplier alreadyConfigured, Runnable configure) {
    Map<String, String> admitted = snapshot(compiledDebug, appDebuggable, applicationId, config);
    if (admitted == null) throw new IllegalStateException("TEST_STORE_BUILD_UNAVAILABLE");
    if (!matches(user, "scv1_teststore_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"))
      throw new IllegalArgumentException("TEST_STORE_SUBJECT_INVALID");
    if (attempted) throw new IllegalStateException("TEST_STORE_CONFIGURATION_RETIRED");
    attempted = true;
    if (alreadyConfigured.getAsBoolean()) throw new IllegalStateException("TEST_STORE_FOREIGN_CONFIGURATION");
    try { configure.run(); } catch (RuntimeException error) { throw new IllegalStateException("TEST_STORE_NATIVE_CONFIGURATION_UNKNOWN"); }
    ownedUser = user;
    return admitted;
  }
  public static synchronized boolean owns(String user, BooleanSupplier currentIdentityMatches) {
    return ownedUser != null && ownedUser.equals(user) && currentIdentityMatches.getAsBoolean();
  }
  private static boolean matches(String value, String pattern) { return value != null && value.matches(pattern); }
}
