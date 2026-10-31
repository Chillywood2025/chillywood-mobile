package expo.modules.chillywoodexternalcontentlinks;

import java.util.UUID;

/** Main-thread confined, single-use flow. No token caching, purchase listener or browser fallback. */
public final class ExternalLinkFlow {
  public interface Reply { void success(String flowId, String token); void failure(String code); }
  public interface Result { void complete(String error, String value); }
  public interface Transport {
    void prepare(Result result);
    void launch(String url, Result result);
    void close();
  }
  public interface Factory { Transport create(); }
  public interface Deadline { void start(Runnable expired); void clear(); }
  private enum Phase { PREPARING, READY, LAUNCHING }
  private static final class Attempt {
    final String id = UUID.randomUUID().toString();
    final Transport transport;
    Phase phase = Phase.PREPARING;
    Reply reply;
    Attempt(Transport transport, Reply reply) { this.transport = transport; this.reply = reply; }
  }
  private final Factory factory;
  private final Deadline deadline;
  private Attempt active;
  private boolean destroyed;
  public ExternalLinkFlow(Factory factory, Deadline deadline) { this.factory = factory; this.deadline = deadline; }

  public void prepare(Reply reply) {
    if (destroyed) { reply.failure("ECL_ACTIVITY_UNAVAILABLE"); return; }
    if (active != null) { reply.failure("ECL_BUSY"); return; }
    final Attempt attempt;
    try { attempt = new Attempt(factory.create(), reply); }
    catch (RuntimeException error) { reply.failure("ECL_UNAVAILABLE"); return; }
    active = attempt;
    deadline.start(() -> fail(attempt, "ECL_TIMEOUT"));
    try {
      attempt.transport.prepare((error, token) -> {
        if (active != attempt || attempt.phase != Phase.PREPARING) return;
        if (error != null) { fail(attempt, error); return; }
        if (token == null || token.isEmpty()) { fail(attempt, "ECL_TOKEN_UNAVAILABLE"); return; }
        attempt.phase = Phase.READY;
        Reply prepared = attempt.reply;
        attempt.reply = null;
        prepared.success(attempt.id, token);
      });
    } catch (RuntimeException error) { fail(attempt, "ECL_UNAVAILABLE"); }
  }

  public void launch(String flowId, String url, Reply reply) {
    Attempt attempt = active;
    if (attempt == null || !attempt.id.equals(flowId) || attempt.phase != Phase.READY) {
      reply.failure("ECL_FLOW_EXPIRED"); return;
    }
    attempt.phase = Phase.LAUNCHING;
    attempt.reply = reply;
    // Do not time out and admit a second disclosure while Play owns a dialog.
    // Its response, service disconnect, or Activity destruction terminates it.
    deadline.clear();
    try {
      attempt.transport.launch(url, (error, ignored) -> {
        if (active != attempt || attempt.phase != Phase.LAUNCHING) return;
        if (error != null) { fail(attempt, error); return; }
        Reply completed = attempt.reply;
        dispose(attempt);
        completed.success(attempt.id, null);
      });
    } catch (RuntimeException error) { fail(attempt, "ECL_LAUNCH_FAILED"); }
  }

  public void cancel(String flowId) {
    // There is no API to dismiss a Play-owned disclosure. Do not unlock the
    // coordinator merely because JS abandons it and allow overlapping dialogs.
    if (active != null && active.id.equals(flowId) && active.phase != Phase.LAUNCHING) fail(active, "ECL_CANCELLED");
  }
  public void background() {
    // Play's own disclosure/browser legitimately backgrounds the activity.
    if (active != null && active.phase != Phase.LAUNCHING) fail(active, "ECL_ACTIVITY_UNAVAILABLE");
  }
  public void destroy() {
    destroyed = true;
    if (active != null) fail(active, "ECL_ACTIVITY_UNAVAILABLE");
  }
  private void fail(Attempt attempt, String code) {
    if (active != attempt) return;
    Reply reply = attempt.reply;
    dispose(attempt);
    if (reply != null) reply.failure(code);
  }
  private void dispose(Attempt attempt) {
    active = null;
    attempt.reply = null;
    deadline.clear();
    try { attempt.transport.close(); } catch (RuntimeException ignored) { /* No private diagnostics. */ }
  }
}
