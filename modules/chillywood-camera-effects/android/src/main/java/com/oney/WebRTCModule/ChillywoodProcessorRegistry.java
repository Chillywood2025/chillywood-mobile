package com.oney.WebRTCModule;

import com.oney.WebRTCModule.videoEffects.ProcessorProvider;
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor;

/**
 * The 144.0.0 provider uses a non-concurrent HashMap. Access it on the same
 * executor as GetUserMediaImpl.setVideoEffects, never from the Expo/JS thread.
 * Package placement is intentional: upstream ThreadUtils is package-private.
 */
public final class ChillywoodProcessorRegistry {
  private ChillywoodProcessorRegistry() {}

  public static void register(String name, VideoFrameProcessor processor) {
    ThreadUtils.runOnExecutor(() -> ProcessorProvider.addProcessor(name, () -> processor));
  }

  public static void remove(String name) {
    ThreadUtils.runOnExecutor(() -> {
      try {
        ProcessorProvider.removeProcessor(name);
      } catch (RuntimeException ignored) {
        // Idempotent lifecycle cleanup. No frames or track identifiers are logged.
      }
    });
  }
}
