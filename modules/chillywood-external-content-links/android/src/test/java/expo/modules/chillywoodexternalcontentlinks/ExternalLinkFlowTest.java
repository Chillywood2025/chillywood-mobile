package expo.modules.chillywoodexternalcontentlinks;

public final class ExternalLinkFlowTest {
  static void check(boolean value) { if (!value) throw new AssertionError(); }
  static final class Fake implements ExternalLinkFlow.Transport {
    ExternalLinkFlow.Result prepare, launch;
    int closes;
    public void prepare(ExternalLinkFlow.Result result) { prepare = result; }
    public void launch(String url, ExternalLinkFlow.Result result) { launch = result; }
    public void close() { closes++; }
  }
  static final class Timer implements ExternalLinkFlow.Deadline {
    Runnable expired;
    public void start(Runnable callback) { expired = callback; }
    public void clear() { expired = null; }
  }
  static final class Reply implements ExternalLinkFlow.Reply {
    String id, token, error; int completions;
    public void success(String id, String token) { this.id = id; this.token = token; completions++; }
    public void failure(String error) { this.error = error; completions++; }
  }
  public static void main(String[] args) {
    Fake fake = new Fake(); Timer timer = new Timer();
    ExternalLinkFlow flow = new ExternalLinkFlow(() -> fake, timer);
    Reply prepared = new Reply(), duplicate = new Reply(), launched = new Reply();
    flow.prepare(prepared); flow.prepare(duplicate);
    check("ECL_BUSY".equals(duplicate.error));
    fake.prepare.complete(null, "token-for-this-attempt");
    check(prepared.completions == 1 && prepared.id != null);
    fake.prepare.complete(null, "late-duplicate-token");
    check(prepared.completions == 1);
    flow.launch(prepared.id, "unused-test-url", launched);
    flow.background(); // Play disclosure may background the activity.
    flow.cancel(prepared.id); // JS cannot dismiss a Play-owned dialog.
    Reply overlapping = new Reply(); flow.prepare(overlapping);
    check("ECL_BUSY".equals(overlapping.error));
    check(fake.closes == 0);
    fake.launch.complete(null, null);
    check(launched.completions == 1 && fake.closes == 1 && timer.expired == null);
    fake.launch.complete(null, null); check(launched.completions == 1);
    Reply reused = new Reply(); flow.launch(prepared.id, "unused", reused);
    check("ECL_FLOW_EXPIRED".equals(reused.error));

    for (String failure : new String[] { "ECL_CANCELLED", "ECL_PLAY_3", "ECL_PLAY_-2", "ECL_SERVICE_DISCONNECTED" }) {
      Fake f = new Fake(); Timer t = new Timer(); ExternalLinkFlow x = new ExternalLinkFlow(() -> f, t);
      Reply p = new Reply(), l = new Reply(); x.prepare(p); f.prepare.complete(null, "fresh");
      x.launch(p.id, "unused", l); f.launch.complete(failure, null);
      check(failure.equals(l.error) && f.closes == 1); // No fallback exists.
    }
    for (boolean preparedFirst : new boolean[] { false, true }) {
      Fake f = new Fake(); Timer t = new Timer(); ExternalLinkFlow x = new ExternalLinkFlow(() -> f, t);
      Reply p = new Reply(); x.prepare(p); if (preparedFirst) f.prepare.complete(null, "fresh");
      x.background(); f.prepare.complete(null, "late");
      check(f.closes == 1 && p.completions == 1);
      Reply l = new Reply(); x.launch(p.id, "unused", l); check(l.error != null);
    }
    Fake f = new Fake(); Timer t = new Timer(); ExternalLinkFlow x = new ExternalLinkFlow(() -> f, t);
    Reply p = new Reply(); x.prepare(p); t.expired.run(); f.prepare.complete(null, "late");
    check("ECL_TIMEOUT".equals(p.error) && p.completions == 1 && f.closes == 1);
    Reply after = new Reply(); x.destroy(); x.prepare(after); check(after.error != null);
    for (String preparationError : new String[] { "ECL_PLAY_3", "ECL_SERVICE_DISCONNECTED", null }) {
      Fake transport = new Fake(); Timer deadline = new Timer();
      ExternalLinkFlow fresh = new ExternalLinkFlow(() -> transport, deadline);
      Reply result = new Reply(); fresh.prepare(result);
      transport.prepare.complete(preparationError, null);
      check(result.error != null && result.completions == 1 && transport.closes == 1);
    }
    Fake transport = new Fake(); Timer deadline = new Timer();
    ExternalLinkFlow fresh = new ExternalLinkFlow(() -> transport, deadline);
    Reply first = new Reply(); fresh.prepare(first); transport.prepare.complete(null, "one");
    deadline.expired.run();
    Reply second = new Reply(); fresh.prepare(second); transport.prepare.complete(null, "two");
    check(!first.id.equals(second.id));
    fresh.cancel(first.id); // Stale cleanup must not cancel a newer operation.
    Reply success = new Reply(); fresh.launch(second.id, "unused", success);
    transport.launch.complete(null, null); check(success.error == null && success.completions == 1);
    Fake destruction = new Fake(); ExternalLinkFlow destroyed = new ExternalLinkFlow(() -> destruction, new Timer());
    Reply preparing = new Reply(); destroyed.prepare(preparing); destroyed.destroy(); destruction.prepare.complete(null, "late");
    check(preparing.error != null && preparing.completions == 1 && destruction.closes == 1);
    System.out.println("External link flow: duplicate, replay, cancellation, error, lifecycle, timeout passed");
  }
}
