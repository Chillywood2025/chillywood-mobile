#import "CHCameraEffectsController.h"
#import "CHCameraFrameProcessor.h"
#import "CHCameraEffectMath.h"
#import "CHWebRTCEffectsBridge.h"
#if __has_include(<livekit_react_native_webrtc/ProcessorProvider.h>)
#import <livekit_react_native_webrtc/ProcessorProvider.h>
#else
#import <livekit-react-native-webrtc/ProcessorProvider.h>
#endif

static char CHWebRTCQueueKey;

@implementation CHCameraEffectsController {
  NSMutableDictionary<NSString *, CHCameraFrameProcessor *> *_processors;
  NSMutableDictionary<NSString *, NSString *> *_unavailable;
  __weak id<CHWebRTCModuleAccess> _webRTC;
  dispatch_queue_t _webRTCQueue;
  BOOL _suspended;
}

- (instancetype)init {
  if ((self = [super init])) {
    _processors = [NSMutableDictionary new];
    _unavailable = [NSMutableDictionary new];
  }
  return self;
}

- (void)attachBridge:(id)bridge {
  @synchronized (self) {
    if (_webRTC || !bridge) return;
    // RCTBridgeProxy implements moduleForClass in bridgeless React Native too.
    id<CHWebRTCModuleAccess> module = CHFindWebRTCModule(bridge);
    if (module.workerQueue) {
      _webRTC = module;
      // Keep the queue alive through teardown even if React has already
      // released its module. Global provider entries must still be removed.
      _webRTCQueue = module.workerQueue;
      dispatch_queue_set_specific(module.workerQueue, &CHWebRTCQueueKey,
                                  (__bridge void *)module.workerQueue, NULL);
    }
  }
}

- (void)onWebRTCQueue:(dispatch_block_t)work {
  dispatch_queue_t queue = _webRTCQueue;
  if (!queue) return;
  // The pinned provider uses an unsynchronized NSMutableDictionary. Its reads
  // happen on this queue, so registration/removal must use the same queue.
  if (dispatch_get_specific(&CHWebRTCQueueKey) == (__bridge void *)queue) work();
  else dispatch_sync(queue, work);
}

- (NSDictionary<NSString *, id> *)capabilities {
  @synchronized (self) {
    BOOL supported = [CHCameraFrameProcessor isSupported] && _webRTC.workerQueue != nil;
    NSMutableDictionary *result = [@{
      @"studioLighting": @(supported), @"chicagoSkyline": @(supported),
      @"crimsonAura": @(supported), @"neonEdge": @(supported), @"spotlight": @(supported),
      @"depthMode": @"subject-parallax"
    } mutableCopy];
    if (!supported) result[@"reason"] = _webRTC ? @"vision_or_gpu_unavailable" : @"webrtc_not_ready";
    return result;
  }
}

- (NSDictionary<NSString *, id> *)configure:(NSString *)trackId
                                    effect:(NSString *)effect
                                 intensity:(double)intensity {
  @synchronized (self) {
    CHCameraFrameProcessor *processor = _processors[trackId];
    if ([effect isEqualToString:@"off"] || CHEffectIntensity(intensity) == 0.0) {
      [processor disable];
      [_unavailable removeObjectForKey:trackId];
      return @{ @"processorName": [NSNull null] };
    }
    if (trackId.length == 0 || ![@[@"studio-light", @"chicago-skyline", @"crimson-aura", @"neon-edge", @"spotlight"] containsObject:effect]) {
      [processor disable];
      _unavailable[trackId] = @"invalid_configuration";
      return @{ @"processorName": [NSNull null] };
    }
    if (_suspended) {
      [processor disable];
      _unavailable[trackId] = @"app_in_background";
      return @{ @"processorName": [NSNull null] };
    }
    if (![CHCameraFrameProcessor isSupported] || !_webRTC.workerQueue) {
      [processor disable];
      _unavailable[trackId] = _webRTC ? @"vision_or_gpu_unavailable" : @"webrtc_not_ready";
      return @{ @"processorName": [NSNull null] };
    }
    if (!processor) {
      processor = [CHCameraFrameProcessor new];
      [self onWebRTCQueue:^{
        [ProcessorProvider addProcessor:processor forName:processor.processorName];
      }];
      _processors[trackId] = processor;
    }
    [_unavailable removeObjectForKey:trackId];
    [processor configureEffect:effect intensity:intensity];
    return @{ @"processorName": processor.processorName };
  }
}

- (void)releaseTrack:(NSString *)trackId {
  @synchronized (self) {
    CHCameraFrameProcessor *processor = _processors[trackId];
    // Disable before unregistering: an existing WebRTC delegate still owns the
    // processor until JS detaches it, and an inference job may still be running.
    [processor disable];
    if (processor) [self onWebRTCQueue:^{ [ProcessorProvider removeProcessor:processor.processorName]; }];
    [_processors removeObjectForKey:trackId];
    [_unavailable removeObjectForKey:trackId];
  }
}

- (NSDictionary<NSString *, id> *)status:(NSString *)trackId {
  @synchronized (self) {
    NSString *reason = _unavailable[trackId];
    if (reason) return @{ @"state": @"unavailable", @"processedFrames": @0, @"reason": reason };
    CHCameraFrameProcessor *processor = _processors[trackId];
    return processor ? [processor status] : @{ @"state": @"off", @"processedFrames": @0 };
  }
}

- (void)invalidate {
  @synchronized (self) {
    NSArray<CHCameraFrameProcessor *> *processors = [_processors.allValues copy];
    // Invalidate every track before touching the provider queue. Native app
    // lifecycle callbacks must not wait for a busy camera start/stop operation.
    for (CHCameraFrameProcessor *processor in processors) [processor disable];
    dispatch_queue_t queue = _webRTCQueue;
    if (queue && processors.count > 0) dispatch_async(queue, ^{
      for (CHCameraFrameProcessor *processor in processors) {
        [ProcessorProvider removeProcessor:processor.processorName];
      }
    });
    [_processors removeAllObjects];
    [_unavailable removeAllObjects];
  }
}

- (void)suspend {
  @synchronized (self) {
    _suspended = YES;
    [self invalidate];
  }
}

- (void)resume {
  @synchronized (self) {
    _suspended = NO;
    [_unavailable removeAllObjects];
    // Intentionally require an explicit foreground JS rebind/reselection;
    // never resume a camera effect from a stale background configuration.
  }
}

@end
