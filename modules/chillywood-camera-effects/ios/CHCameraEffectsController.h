#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// The only public Objective-C surface, imported by the Expo Swift module.
@interface CHCameraEffectsController : NSObject
// Foundation-only public API: the Expo bridge object is inspected privately.
- (void)attachBridge:(nullable id)bridge NS_SWIFT_NAME(attachBridge(_:));
- (NSDictionary<NSString *, id> *)capabilities NS_SWIFT_NAME(capabilities());
- (NSDictionary<NSString *, id> *)configure:(NSString *)trackId
                                    effect:(NSString *)effect
                                 intensity:(double)intensity NS_SWIFT_NAME(configure(_:effect:intensity:));
- (void)releaseTrack:(NSString *)trackId NS_SWIFT_NAME(releaseTrack(_:));
- (NSDictionary<NSString *, id> *)status:(NSString *)trackId NS_SWIFT_NAME(status(_:));
- (void)suspend;
- (void)resume;
- (void)invalidate;
@end

NS_ASSUME_NONNULL_END
