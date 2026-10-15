#import <Foundation/Foundation.h>
#import <dispatch/dispatch.h>

NS_ASSUME_NONNULL_BEGIN

/// The minimal queue surface consumed from the pinned WebRTC module. Keeping
/// React/WebRTC integration headers out of this module's umbrella avoids their
/// non-modular React headers leaking into the Expo Swift module.
@protocol CHWebRTCModuleAccess <NSObject>
@property(nonatomic, readonly, strong) dispatch_queue_t workerQueue;
@end

FOUNDATION_EXPORT id<CHWebRTCModuleAccess> _Nullable CHFindWebRTCModule(id _Nullable bridge);

NS_ASSUME_NONNULL_END
