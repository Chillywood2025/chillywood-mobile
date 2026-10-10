package android.os;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Controlled main looper: never executes a posted operation inline. */
public final class Handler {
    public static long now;
    public static boolean onMain;
    public static int globalRemovals;
    private static long sequence;
    private static final List<Task> tasks = new ArrayList<>();
    private record Task(Handler owner, Runnable action, long due, long sequence) {}
    public Handler(Looper looper) {}
    public boolean post(Runnable action) { return postDelayed(action, 0); }
    public boolean postDelayed(Runnable action, long delay) {
        tasks.add(new Task(this, action, now + delay, ++sequence));
        return true;
    }
    public boolean postAtFrontOfQueue(Runnable action) {
        tasks.add(new Task(this, action, now, -++sequence));
        return true;
    }
    public void removeCallbacksAndMessages(Object token) {
        ++globalRemovals;
        tasks.removeIf(task -> task.owner == this);
    }
    public static void requireMain() {
        if (!onMain) throw new AssertionError("Android/AudioSwitch operation ran off main");
    }
    public static void reset() {
        tasks.clear(); now = 0; sequence = 0; onMain = false; globalRemovals = 0;
    }
    public static int pendingCount() { return tasks.size(); }
    public static void drain() { advance(0); }
    public static void advance(long elapsed) {
        long until = now + elapsed;
        int turns = 0;
        while (true) {
            Task next = tasks.stream().filter(task -> task.due <= until)
                .min(Comparator.comparingLong(Task::due).thenComparingLong(Task::sequence)).orElse(null);
            if (next == null) break;
            if (++turns > 20_000) throw new AssertionError("Unbounded main queue");
            tasks.remove(next); now = next.due; onMain = true;
            try { next.action.run(); } finally { onMain = false; }
        }
        now = until;
    }
}
