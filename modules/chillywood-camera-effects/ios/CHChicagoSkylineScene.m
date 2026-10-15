#import "CHChicagoSkylineScene.h"
#import "CHCameraEffectMath.h"
#import <CoreGraphics/CoreGraphics.h>

static CIImage *CHDrawSkylineLayer(size_t width, size_t height, NSInteger layer) {
  CGColorSpaceRef space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  CGContextRef context = CGBitmapContextCreate(NULL, width, height, 8, width * 4, space,
    kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
  CGColorSpaceRelease(space);
  if (!context) return nil;
  CGContextScaleCTM(context, width, height);
  if (layer == 0) {
    CGFloat colors[] = { 0.94, 0.66, 0.53, 1, 0.25, 0.31, 0.48, 1, 0.09, 0.16, 0.31, 1 };
    CGFloat stops[] = { 0, 0.5, 1 };
    CGColorSpaceRef gradientSpace = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
    CGGradientRef gradient = CGGradientCreateWithColorComponents(gradientSpace, colors, stops, 3);
    CGContextDrawLinearGradient(context, gradient, CGPointMake(0.5, 0), CGPointMake(0.5, 1), 0);
    CGGradientRelease(gradient);
    CGColorSpaceRelease(gradientSpace);
  } else {
    double base = layer == 1 ? 0.22 : (layer == 2 ? 0.16 : 0.08);
    CGFloat red = layer == 1 ? 0.26 : (layer == 2 ? 0.13 : 0.07);
    CGFloat green = layer == 1 ? 0.31 : (layer == 2 ? 0.20 : 0.14);
    CGFloat blue = layer == 1 ? 0.43 : (layer == 2 ? 0.32 : 0.23);
    CGContextSetRGBFillColor(context, red, green, blue, 1);
    // Deterministic geometry: there is no download, image license, or random
    // frame-to-frame skyline flicker. Different rows form separate parallax planes.
    for (int index = 0; index < 22; index++) {
      double x = index / 21.0 - 0.035;
      double buildingHeight = 0.07 + ((index * 13 + layer * 7) % 19) * 0.007;
      double buildingWidth = 0.036 + ((index * 3 + layer) % 4) * 0.006;
      CGContextFillRect(context, CGRectMake(x, base, buildingWidth, buildingHeight));
      if (layer == 2) {
        CGContextSetRGBFillColor(context, 0.92, 0.69, 0.43, 0.55);
        for (int floor = 1; floor < 7; floor++) {
          if ((index + floor) % 3 != 0 && floor * 0.019 < buildingHeight - 0.015) {
            CGContextFillRect(context, CGRectMake(x + 0.009, base + floor * 0.019, 0.005, 0.005));
            CGContextFillRect(context, CGRectMake(x + 0.023, base + floor * 0.019, 0.005, 0.005));
          }
        }
        CGContextSetRGBFillColor(context, red, green, blue, 1);
      }
    }
    if (layer == 2) {
      // Willis Tower's stepped bundled profile and twin antennae.
      CGContextFillRect(context, CGRectMake(0.21, base, 0.085, 0.30));
      CGContextFillRect(context, CGRectMake(0.223, base + 0.30, 0.059, 0.085));
      CGContextFillRect(context, CGRectMake(0.239, base + 0.385, 0.033, 0.045));
      CGContextFillRect(context, CGRectMake(0.241, base + 0.43, 0.003, 0.062));
      CGContextFillRect(context, CGRectMake(0.266, base + 0.43, 0.003, 0.062));
      // The taper and twin antennae of 875 North Michigan (the Hancock).
      CGContextMoveToPoint(context, 0.71, base);
      CGContextAddLineToPoint(context, 0.789, base);
      CGContextAddLineToPoint(context, 0.773, base + 0.39);
      CGContextAddLineToPoint(context, 0.728, base + 0.39);
      CGContextClosePath(context);
      CGContextFillPath(context);
      CGContextFillRect(context, CGRectMake(0.731, base + 0.39, 0.003, 0.055));
      CGContextFillRect(context, CGRectMake(0.767, base + 0.39, 0.003, 0.055));
      CGContextSetRGBStrokeColor(context, 0.48, 0.53, 0.61, 0.65);
      CGContextSetLineWidth(context, 0.002);
      for (int cross = 0; cross < 4; cross++) {
        double bottom = base + cross * 0.09;
        CGContextMoveToPoint(context, 0.725, bottom);
        CGContextAddLineToPoint(context, 0.776, bottom + 0.08);
        CGContextMoveToPoint(context, 0.776, bottom);
        CGContextAddLineToPoint(context, 0.725, bottom + 0.08);
      }
      CGContextStrokePath(context);
    }
    CGContextSetRGBFillColor(context, red, green, blue, 1);
    CGContextFillRect(context, CGRectMake(0, 0, 1, base + 0.005));
    if (layer == 3) {
      // A restrained riverfront band grounds the foreground layer.
      CGContextSetRGBFillColor(context, 0.14, 0.28, 0.37, 1);
      CGContextFillRect(context, CGRectMake(0, 0, 1, 0.075));
      CGContextSetRGBFillColor(context, 0.80, 0.58, 0.39, 0.4);
      for (int line = 0; line < 12; line++) {
        CGContextFillRect(context, CGRectMake(line * 0.09, 0.022 + (line % 3) * 0.014, 0.043, 0.002));
      }
    }
  }
  CGImageRef image = CGBitmapContextCreateImage(context);
  CIImage *result = image ? [CIImage imageWithCGImage:image] : nil;
  if (image) CGImageRelease(image);
  CGContextRelease(context);
  return result;
}

@implementation CHChicagoSkylineScene {
  NSArray<CIImage *> *_layers;
  CGRect _extent;
}

- (instancetype)initWithExtent:(CGRect)extent {
  if ((self = [super init])) {
    _extent = extent;
    double scale = MIN(1.0, 1024.0 / MAX(extent.size.width, extent.size.height));
    size_t width = MAX(1, (size_t)ceil(extent.size.width * scale));
    size_t height = MAX(1, (size_t)ceil(extent.size.height * scale));
    NSMutableArray *layers = [NSMutableArray new];
    for (NSInteger layer = 0; layer < 4; layer++) {
      CIImage *image = CHDrawSkylineLayer(width, height, layer);
      if (!image) return nil;
      [layers addObject:[image imageByApplyingTransform:CGAffineTransformMakeScale(
        extent.size.width / width, extent.size.height / height)]];
    }
    _layers = layers;
  }
  return self;
}

- (CIImage *)imageWithHorizontalOffset:(double)x verticalOffset:(double)y intensity:(double)intensity {
  CIImage *result = _layers[0];
  const double movement[] = { 0.0, 0.006, 0.014, 0.023 };
  for (NSUInteger layer = 1; layer < _layers.count; layer++) {
    // Overscan covers the edges at every permitted translation. The subject
    // stays fixed; only the illustrated background planes move.
    CGAffineTransform transform = CGAffineTransformMakeScale(1.08, 1.08);
    transform.tx = -_extent.size.width * 0.04 + CHParallaxShift(x, movement[layer], _extent.size.width, intensity);
    transform.ty = -_extent.size.height * 0.04 + CHParallaxShift(y, movement[layer], _extent.size.height, intensity) * 0.45;
    result = [[_layers[layer] imageByApplyingTransform:transform] imageByCompositingOverImage:result];
  }
  return [result imageByCroppingToRect:_extent];
}

@end
