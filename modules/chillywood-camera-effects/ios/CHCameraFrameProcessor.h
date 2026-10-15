#import <Foundation/Foundation.h>
#if __has_include(<livekit_react_native_webrtc/VideoFrameProcessor.h>)
#import <livekit_react_native_webrtc/VideoFrameProcessor.h>
#else
// CocoaPods' non-framework public-header layout retains the pod name.
#import <livekit-react-native-webrtc/VideoFrameProcessor.h>
#endif

NS_ASSUME_NONNULL_BEGIN

@interface CHCameraFrameProcessor : NSObject <VideoFrameProcessorDelegate>
@property(nonatomic, readonly, copy) NSString *processorName;
+ (BOOL)isSupported;
- (void)configureEffect:(NSString *)effect intensity:(double)intensity;
- (void)disable;
- (NSDictionary<NSString *, id> *)status;
@end

NS_ASSUME_NONNULL_END
