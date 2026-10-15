#import <CoreImage/CoreImage.h>

NS_ASSUME_NONNULL_BEGIN

/// Original illustrated skyline, generated locally. Its three layers move by
/// small, different amounts from subject motion. No depth sensor is consulted.
@interface CHChicagoSkylineScene : NSObject
- (nullable instancetype)initWithExtent:(CGRect)extent;
- (CIImage *)imageWithHorizontalOffset:(double)x verticalOffset:(double)y intensity:(double)intensity;
@end

NS_ASSUME_NONNULL_END
