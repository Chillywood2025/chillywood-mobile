package expo.modules.chillywoodcameraeffects;

import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;
import org.webrtc.JavaI420Buffer;

/** Three bounded buffers; an encoder retaining all three causes passthrough. */
final class FrameBufferPool {
  private final List<Slot> slots = new ArrayList<>();
  private boolean closed;
  private static final class Slot {
    final int width, height;
    final ByteBuffer y, u, v;
    boolean busy;
    Slot(int width, int height) {
      this.width = width; this.height = height;
      y = ByteBuffer.allocateDirect(width * height);
      u = ByteBuffer.allocateDirect(width * height / 4);
      v = ByteBuffer.allocateDirect(width * height / 4);
    }
  }
  synchronized JavaI420Buffer acquire(int w, int h) {
    if (closed) return null;
    // Count retained buffers from an old camera size against the same bound.
    slots.removeIf(slot -> !slot.busy && (slot.width != w || slot.height != h));
    Slot available = null;
    for (Slot slot : slots) {
      if (!slot.busy && slot.width == w && slot.height == h) { available = slot; break; }
    }
    if (available == null) {
      if (slots.size() == 3) return null;
      available = new Slot(w, h); slots.add(available);
    }
    final Slot slot = available;
    slot.busy = true;
    // wrap starts at one reference. Only the final downstream release permits reuse.
    return JavaI420Buffer.wrap(w, h, slot.y, w, slot.u, w / 2, slot.v, w / 2, () -> recycle(slot));
  }
  private synchronized void recycle(Slot slot) { slot.busy = false; }
  synchronized void close() { closed = true; slots.clear(); }
}
