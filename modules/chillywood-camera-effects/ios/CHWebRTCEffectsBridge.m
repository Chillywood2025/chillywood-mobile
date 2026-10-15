#import "CHWebRTCEffectsBridge.h"

// Exact selectors and object argument/return types were verified against
// @livekit/react-native-webrtc 144.0.0 and React Native's RCTBridgeProxy.
// The podspec pins that SDK version. This small runtime boundary avoids importing
// WebRTCModule.h and its React headers. ProcessorProvider and its frame delegate
// remain directly imported and compiler checked in the processor/controller.
// No private Apple APIs, method swizzling, or copied SDK implementation is used.
@protocol CHReactModuleLookup <NSObject>
- (id)moduleForClass:(Class)moduleClass;
@end

id<CHWebRTCModuleAccess> CHFindWebRTCModule(id bridge) {
  Class moduleClass = NSClassFromString(@"WebRTCModule");
  if (!moduleClass || ![bridge respondsToSelector:@selector(moduleForClass:)]) return nil;
  id module = [(id<CHReactModuleLookup>)bridge moduleForClass:moduleClass];
  return [module respondsToSelector:@selector(workerQueue)] ? (id<CHWebRTCModuleAccess>)module : nil;
}
