// Qualification-only fixed-run lifetime policy. A run UUID is a local label, never an Auth session.
package expo.modules.chillywoodqualification;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.List;
import java.util.function.BooleanSupplier;

/** App-owned lifetime policy. Store.commit must atomically persist and read back
 * the entire snapshot before returning. No callback is receipt authority. */
public final class QualificationPolicy {
  public interface Store { Map<String,String> load(); void commit(Map<String,String> snapshot); }
  public static final String APPLICATION_ID = "com.chillywood.qualification.teststore";
  private final Store store;
  private Map<String,String> state;
  private boolean configurationAttempted, configured, retired, persistenceFailed;
  private String session, handle, handleDispatch, handleFingerprint, nativeInvocation, lookup;
  public QualificationPolicy(Store store) {
    this.store = store;
    Map<String,String> value = store.load();
    if (value == null) {
      value = new HashMap<>(); value.put("version", "qualification-1"); value.put("installationId", UUID.randomUUID().toString());
      value.put("owner", ""); value.put("active", ""); value.put("sealed", "false");
      store.commit(value);
      require(value.equals(store.load()));
    }
    validate(value); this.state = new HashMap<>(value);
  }
  public static boolean uuid(String value) { return value != null && value.matches("[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"); }
  public static boolean cacheMatches(String expected, boolean footprint, List<String> identities) {
    return footprint ? !identities.isEmpty() && identities.stream().allMatch(expected::equals) : identities.isEmpty();
  }
  private static void require(boolean value) { if (!value) throw new IllegalStateException("QUALIFICATION_NATIVE_UNAVAILABLE"); }
  private static void validate(Map<String,String> value) {
    require(value != null && value.size() >= 5 && value.size() <= 37 && "qualification-1".equals(value.get("version"))
      && ("true".equals(value.get("sealed")) || "false".equals(value.get("sealed"))) && uuid(value.get("installationId")) && value.containsKey("owner") && value.containsKey("active")
      && (value.get("active").isEmpty() || uuid(value.get("active"))));
    for (Map.Entry<String,String> e : value.entrySet()) {
      require(e.getValue() != null && e.getValue().length() <= 32000);
      require(e.getKey().equals("version") || e.getKey().equals("installationId") || e.getKey().equals("owner") || e.getKey().equals("active") || e.getKey().equals("sealed")
        || (e.getKey().startsWith("record:") && uuid(e.getKey().substring(7))));
    }
    require(value.get("active").isEmpty() || value.containsKey("record:" + value.get("active")));
  }
  private void commit(Map<String,String> next) {
    require(!persistenceFailed);
    try {
      validate(next); store.commit(new HashMap<>(next));
      Map<String,String> observed = store.load(); require(next.equals(observed)); state = new HashMap<>(next);
    } catch (Exception error) {
      retired = true; persistenceFailed = true; handle = null;
      throw new IllegalStateException("QUALIFICATION_NATIVE_UNAVAILABLE", error);
    }
  }
  public synchronized String installationId() { return state.get("installationId"); }
  public synchronized java.util.List<String> records() { return state.keySet().stream().filter(k -> k.startsWith("record:")).sorted().map(state::get).collect(java.util.stream.Collectors.toList()); }
  public synchronized String owner() { return state.get("owner"); }
  public synchronized boolean configuredLocally() { return configured; }
  public synchronized boolean sealed() { return "true".equals(state.get("sealed")); }
  public synchronized void seal() { Map<String,String> next = new HashMap<>(state); next.put("sealed", "true"); commit(next); retired = true; handle = null; }
  public synchronized String active() { return state.get("active"); }
  public synchronized boolean retired() { return retired; }
  public synchronized String read(String dispatchId) { require(uuid(dispatchId)); return state.get("record:" + dispatchId); }
  public synchronized boolean isNativeInvocation(String dispatchId) { return dispatchId.equals(nativeInvocation); }
  public synchronized void bind(String ownerDocument, String capturedSession, BooleanSupplier alreadyConfigured, Runnable configure) {
    require(uuid(capturedSession) && ownerDocument != null && !ownerDocument.isEmpty() && !retired && !sealed());
    if (!state.get("owner").isEmpty() && !state.get("owner").equals(ownerDocument)) { retired = true; require(false); }
    if (session != null && !session.equals(capturedSession)) { retired = true; require(false); }
    if (state.get("owner").isEmpty()) { Map<String,String> next = new HashMap<>(state); next.put("owner", ownerDocument); commit(next); }
    session = capturedSession;
    if (configured) return;
    require(!configurationAttempted); configurationAttempted = true;
    require(!alreadyConfigured.getAsBoolean());
    configure.run(); configured = true;
  }
  public synchronized void current(String capturedSession) { require(configured && !retired && !sealed() && capturedSession.equals(session)); }
  public synchronized void retire(String capturedSession) {
    if (capturedSession != null && capturedSession.equals(session)) { retired = true; handle = null; }
  }
  public synchronized String beginLookup(String dispatchId, String capturedSession) {
    current(capturedSession); require(uuid(dispatchId) && lookup == null && state.get("active").isEmpty() && !state.containsKey("record:" + dispatchId));
    lookup = UUID.randomUUID().toString(); return lookup;
  }
  public synchronized void endLookup(String token) { require(token != null && token.equals(lookup)); lookup = null; }
  public synchronized String reserveAfterLookup(String token, String dispatchId, String capturedSession, String fingerprint, String document) {
    require(token != null && token.equals(lookup));
    String ticket = reserve(dispatchId, capturedSession, fingerprint, document); lookup = null; return ticket;
  }
  public synchronized String reserve(String dispatchId, String capturedSession, String fingerprint, String preparedDocument) {
    current(capturedSession); require(uuid(dispatchId) && state.get("active").isEmpty() && !state.containsKey("record:" + dispatchId)
      && fingerprint != null && fingerprint.matches("[a-f0-9]{64}") && preparedDocument != null);
    Map<String,String> next = new HashMap<>(state); next.put("active", dispatchId); next.put("record:" + dispatchId, preparedDocument); commit(next);
    handle = UUID.randomUUID().toString(); handleDispatch = dispatchId; handleFingerprint = fingerprint; return handle;
  }
  public synchronized void prepared(String ticket, String dispatchId, String capturedSession, String fingerprint) {
    current(capturedSession); require(ticket.equals(handle) && dispatchId.equals(handleDispatch) && dispatchId.equals(state.get("active"))
      && fingerprint.equals(handleFingerprint) && nativeInvocation == null);
  }
  public synchronized void invoke(String ticket, String dispatchId, String capturedSession, String fingerprint, String invokingDocument) {
    prepared(ticket, dispatchId, capturedSession, fingerprint);
    Map<String,String> next = new HashMap<>(state); next.put("record:" + dispatchId, invokingDocument); commit(next);
    handle = null; nativeInvocation = dispatchId;
  }
  public synchronized void complete(String dispatchId, String completedDocument) {
    require(dispatchId.equals(nativeInvocation) && dispatchId.equals(state.get("active")));
    Map<String,String> next = new HashMap<>(state); next.put("record:" + dispatchId, completedDocument); next.put("active", "");
    commit(next); nativeInvocation = null; handleDispatch = null; handleFingerprint = null;
  }
}
