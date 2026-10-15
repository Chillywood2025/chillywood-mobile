#import "CHCameraFrameProcessor.h"
#import "CHCameraEffectMath.h"
#import "CHChicagoSkylineScene.h"
#import <AVFoundation/AVFoundation.h>
#import <CoreImage/CoreImage.h>
#import <CoreVideo/CoreVideo.h>
#import <ImageIO/ImageIO.h>
#import <Metal/Metal.h>
#import <QuartzCore/QuartzCore.h>
#import <Vision/Vision.h>
#import <WebRTC/WebRTC.h>

static const double CHInferenceInterval = 1.0 / 15.0;
static const double CHInferenceBudget = 0.120;
static const double CHSnapshotMaxAge = 0.200;
static const double CHRenderBudget = 0.020;
static const size_t CHMaximumPixels = 1920 * 1080;

static dispatch_semaphore_t CHVisionAdmissionSlot(void) {
  static dispatch_semaphore_t slot;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ slot = dispatch_semaphore_create(1); });
  return slot;
}

static CIImage *CHScaleMask(CIImage *mask, double amount) {
  CIImage *scaled = [mask imageByApplyingFilter:@"CIColorMatrix" withInputParameters:@{
    @"inputRVector": [CIVector vectorWithX:amount Y:0 Z:0 W:0],
    @"inputGVector": [CIVector vectorWithX:0 Y:amount Z:0 W:0],
    @"inputBVector": [CIVector vectorWithX:0 Y:0 Z:amount W:0]
  }];
  return [scaled imageByApplyingFilter:@"CIColorClamp" withInputParameters:@{
    @"inputMinComponents": [CIVector vectorWithX:0 Y:0 Z:0 W:0],
    @"inputMaxComponents": [CIVector vectorWithX:1 Y:1 Z:1 W:1]
  }];
}

@interface CHCameraAnalysis : NSObject
@property(nonatomic) uint64_t generation;
@property(nonatomic) double capturedAt;
@property(nonatomic) CGRect face;
@property(nonatomic) double luminance;
@property(nonatomic) double horizontalOffset;
@property(nonatomic) double verticalOffset;
@property(nonatomic, strong) CIImage *personMask;
@property(nonatomic, strong) CHChicagoSkylineScene *scene;
@end
@implementation CHCameraAnalysis
@end

@implementation CHCameraFrameProcessor {
  // Capture, JS configuration, and inference all share only these locked fields.
  NSLock *_lock;
  NSString *_effect;
  double _intensity;
  uint64_t _generation;
  uint64_t _processedFrames;
  NSString *_state;
  NSString *_reason;
  NSString *_captureSignature;
  BOOL _inferenceInFlight;
  BOOL _renderInFlight;
  double _lastInference;
  double _retryAfter;
  double _lastOutputAt;
  double _animationStart;
  CHCameraAnalysis *_analysis;

  CIContext *_context;
  CGColorSpaceRef _colorSpace;
  dispatch_queue_t _inferenceQueue;

  // Only the single inference worker touches these. No work is ever queued
  // behind another inference, including across configuration generations.
  uint64_t _workerGeneration;
  VNSequenceRequestHandler *_sequence;
  VNDetectFaceRectanglesRequest *_faceDetection;
  VNTrackObjectRequest *_faceTracking;
  VNGeneratePersonSegmentationRequest *_segmentation;
  double _lastFaceDetection;
  double _smoothedLuminance;
  double _smoothedX;
  double _smoothedY;
  BOOL _hasSmoothing;
  CHChicagoSkylineScene *_scene;
  CGRect _sceneExtent;

  // Only the non-reentrant capture renderer touches this pool. The allocation
  // threshold bounds buffers retained by the downstream encoder.
  CVPixelBufferPoolRef _outputPool;
  CGSize _outputSize;
}

+ (BOOL)isSupported {
  if (@available(iOS 15.0, *)) {
    return NSClassFromString(@"VNGeneratePersonSegmentationRequest") != nil && MTLCreateSystemDefaultDevice() != nil;
  }
  return NO;
}

- (instancetype)init {
  if ((self = [super init])) {
    _processorName = [@"chillywood-camera-" stringByAppendingString:NSUUID.UUID.UUIDString];
    _lock = [NSLock new];
    _effect = @"off";
    _state = @"off";
    _generation = 1;
    _animationStart = CACurrentMediaTime();
    _colorSpace = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
    id<MTLDevice> device = MTLCreateSystemDefaultDevice();
    if (device) _context = [CIContext contextWithMTLDevice:device options:@{
      kCIContextCacheIntermediates: @NO,
      kCIContextWorkingColorSpace: (__bridge id)_colorSpace,
      kCIContextOutputColorSpace: (__bridge id)_colorSpace
    }];
    _inferenceQueue = dispatch_queue_create("com.chillywood.camera-effects.vision",
      dispatch_queue_attr_make_with_qos_class(DISPATCH_QUEUE_SERIAL, QOS_CLASS_USER_INITIATED, 0));
  }
  return self;
}

- (void)dealloc {
  if (_outputPool) CVPixelBufferPoolRelease(_outputPool);
  if (_colorSpace) CGColorSpaceRelease(_colorSpace);
}

- (void)configureEffect:(NSString *)effect intensity:(double)intensity {
  double value = CHEffectIntensity(intensity);
  if ([effect isEqualToString:@"off"] || value == 0) {
    [self disable];
    return;
  }
  [_lock lock];
  if ([_effect isEqualToString:effect] && _intensity == value) {
    [_lock unlock];
    return;
  }
  _generation++;
  _effect = [effect copy];
  _intensity = value;
  _analysis = nil;
  _lastInference = 0;
  _retryAfter = 0;
  _processedFrames = 0;
  _lastOutputAt = 0;
  _state = @"starting";
  _reason = nil;
  [_lock unlock];
}

- (void)disable {
  [_lock lock];
  _generation++;
  _effect = @"off";
  _intensity = 0;
  _analysis = nil;
  _captureSignature = nil;
  _lastOutputAt = 0;
  _state = @"off";
  _reason = nil;
  [_lock unlock];
}

- (NSDictionary<NSString *, id> *)status {
  [_lock lock];
  if ([_state isEqualToString:@"active"] && CACurrentMediaTime() - _lastOutputAt > CHSnapshotMaxAge) {
    _state = @"starting";
    _reason = @"waiting_for_camera_frames";
  }
  NSMutableDictionary *result = [@{ @"state": _state, @"processedFrames": @(_processedFrames) } mutableCopy];
  if (_reason) result[@"reason"] = _reason;
  [_lock unlock];
  return result;
}

- (void)recordFallback:(NSString *)reason state:(NSString *)state generation:(uint64_t)generation cooldown:(double)cooldown {
  [_lock lock];
  if (_generation == generation && ![_effect isEqualToString:@"off"]) {
    _state = state;
    _reason = reason;
    if (cooldown > 0) {
      _retryAfter = CACurrentMediaTime() + cooldown;
      _analysis = nil;
    }
  }
  [_lock unlock];
}

- (AVCaptureDevicePosition)cameraPosition:(RTCVideoCapturer *)capturer {
  if ([capturer isKindOfClass:[RTCCameraVideoCapturer class]]) {
    for (AVCaptureInput *input in ((RTCCameraVideoCapturer *)capturer).captureSession.inputs) {
      if ([input isKindOfClass:[AVCaptureDeviceInput class]]) {
        AVCaptureDevice *device = ((AVCaptureDeviceInput *)input).device;
        if ([device hasMediaType:AVMediaTypeVideo]) return device.position;
      }
    }
  }
  return AVCaptureDevicePositionUnspecified;
}

- (RTCVideoFrame *)capturer:(RTCVideoCapturer *)capturer didCaptureVideoFrame:(RTCVideoFrame *)frame {
  @autoreleasepool {
    [_lock lock];
    uint64_t generation = _generation;
    if ([_effect isEqualToString:@"off"] || _intensity == 0 || _renderInFlight || CACurrentMediaTime() < _retryAfter) {
      [_lock unlock];
      return frame;
    }
    _renderInFlight = YES;
    [_lock unlock];

    @try {
      return [self processFrame:frame capturer:capturer generation:generation];
    } @catch (__unused NSException *exception) {
      // Never leak camera data or SDK error details into JS/logs, and never
      // return a nil frame to the provider's synchronous processing chain.
      [self recordFallback:@"frame_processing_failed" state:@"error" generation:generation cooldown:0.5];
      return frame;
    } @finally {
      [_lock lock];
      _renderInFlight = NO;
      [_lock unlock];
    }
  }
}

- (RTCVideoFrame *)processFrame:(RTCVideoFrame *)frame capturer:(RTCVideoCapturer *)capturer generation:(uint64_t)initialGeneration {
  if (!_context || NSProcessInfo.processInfo.thermalState >= NSProcessInfoThermalStateSerious) {
    [self recordFallback:@"device_under_pressure" state:@"unavailable" generation:initialGeneration cooldown:1.0];
    return frame;
  }
  if (![frame.buffer isKindOfClass:[RTCCVPixelBuffer class]]) {
    [self recordFallback:@"unsupported_frame_buffer" state:@"unavailable" generation:initialGeneration cooldown:0];
    return frame;
  }
  CVPixelBufferRef pixelBuffer = ((RTCCVPixelBuffer *)frame.buffer).pixelBuffer;
  size_t width = CVPixelBufferGetWidth(pixelBuffer);
  size_t height = CVPixelBufferGetHeight(pixelBuffer);
  OSType format = CVPixelBufferGetPixelFormatType(pixelBuffer);
  if (width == 0 || height == 0 || width > CHMaximumPixels / height ||
      width != (size_t)frame.width || height != (size_t)frame.height ||
      (format != kCVPixelFormatType_32BGRA && format != kCVPixelFormatType_420YpCbCr8BiPlanarFullRange &&
       format != kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange)) {
    // Cropped/adapted or HDR buffers need an explicit conversion, not a guessed
    // mask alignment. Preserve the source until such a path is supported.
    [self recordFallback:@"unsupported_frame_layout" state:@"unavailable" generation:initialGeneration cooldown:0];
    return frame;
  }

  CIImage *source = [[CIImage imageWithCVPixelBuffer:pixelBuffer]
    imageByApplyingOrientation:(int)CHImageOrientation((int)frame.rotation)];
  source = [source imageByApplyingTransform:CGAffineTransformMakeTranslation(-source.extent.origin.x, -source.extent.origin.y)];
  CGRect extent = source.extent;
  NSString *signature = [NSString stringWithFormat:@"%zu:%zu:%d:%ld", width, height, (int)frame.rotation,
    (long)[self cameraPosition:capturer]];

  [_lock lock];
  if (_generation != initialGeneration || [_effect isEqualToString:@"off"]) {
    [_lock unlock];
    return frame;
  }
  if (![_captureSignature isEqualToString:signature]) {
    _captureSignature = signature;
    _generation++;
    _analysis = nil;
    _lastInference = 0;
    _state = @"starting";
    _reason = nil;
  }
  uint64_t generation = _generation;
  NSString *effect = _effect;
  double intensity = _intensity;
  CHCameraAnalysis *analysis = _analysis;
  double capturedAt = CACurrentMediaTime();
  BOOL schedule = !_inferenceInFlight && capturedAt - _lastInference >= CHInferenceInterval;
  // A released processor may still have one uncancellable Vision request in
  // flight. Admission is global so rapid release/recreate cannot accumulate
  // requests across instances. Capture never waits for this slot.
  if (schedule) schedule = dispatch_semaphore_wait(CHVisionAdmissionSlot(), DISPATCH_TIME_NOW) == 0;
  if (schedule) {
    _inferenceInFlight = YES;
    _lastInference = capturedAt;
  }
  [_lock unlock];

  if (schedule) {
    // The CIImage retains the source pixel buffer. At most one such camera
    // buffer is retained for inference, and the capture thread never waits.
    dispatch_async(_inferenceQueue, ^{
      @autoreleasepool {
        [self analyze:source effect:effect generation:generation capturedAt:capturedAt];
      }
    });
  }
  if (!analysis || !CHSnapshotIsFresh(capturedAt, analysis.capturedAt, generation, analysis.generation, CHSnapshotMaxAge)) {
    [self recordFallback:@"waiting_for_fresh_subject" state:@"starting" generation:generation cooldown:0];
    return frame;
  }

  double renderStarted = CACurrentMediaTime();
  CIImage *composite = nil;
  if ([effect isEqualToString:@"studio-light"]) composite = [self applyLighting:source analysis:analysis intensity:intensity];
  else if ([effect isEqualToString:@"chicago-skyline"]) composite = [self applySkyline:source analysis:analysis intensity:intensity];
  else composite = [self applyCreativeEffect:effect source:source analysis:analysis intensity:intensity];
  if (!composite) return frame;
  CVPixelBufferRef output = [self createOutputForExtent:extent];
  if (!output) {
    [self recordFallback:@"output_buffers_busy" state:@"unavailable" generation:generation cooldown:0.25];
    return frame;
  }
  RTCVideoFrame *processed = nil;
  @try {
    [_context render:composite toCVPixelBuffer:output bounds:extent colorSpace:_colorSpace];
    RTCCVPixelBuffer *buffer = [[RTCCVPixelBuffer alloc] initWithPixelBuffer:output];
    processed = [[RTCVideoFrame alloc] initWithBuffer:buffer rotation:RTCVideoRotation_0 timeStampNs:frame.timeStampNs];
  } @finally {
    CVPixelBufferRelease(output);
  }
  double finishedAt = CACurrentMediaTime();
  if (finishedAt - renderStarted > CHRenderBudget) {
    [self recordFallback:@"render_budget_exceeded" state:@"unavailable" generation:generation cooldown:0.5];
    return frame;
  }

  [_lock lock];
  // Linearization point: Off/release wins against any earlier queued analysis
  // or render. Frames already handed to WebRTC cannot be recalled from its
  // encoder/network buffers, but no later callback may emit this generation.
  BOOL current = processed != nil && ![_effect isEqualToString:@"off"] && _intensity > 0 &&
    CHSnapshotIsFresh(finishedAt, analysis.capturedAt, _generation, analysis.generation, CHSnapshotMaxAge);
  if (current) {
    _processedFrames++;
    _lastOutputAt = finishedAt;
    _state = @"active";
    _reason = nil;
  }
  [_lock unlock];
  return current && processed ? processed : frame;
}

- (CVPixelBufferRef)createOutputForExtent:(CGRect)extent {
  CGSize size = extent.size;
  if (!_outputPool || !CGSizeEqualToSize(_outputSize, size)) {
    if (_outputPool) CVPixelBufferPoolRelease(_outputPool);
    _outputPool = NULL;
    NSDictionary *attributes = @{
      (id)kCVPixelBufferWidthKey: @((size_t)size.width),
      (id)kCVPixelBufferHeightKey: @((size_t)size.height),
      (id)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32BGRA),
      (id)kCVPixelBufferIOSurfacePropertiesKey: @{},
      (id)kCVPixelBufferMetalCompatibilityKey: @YES
    };
    CVReturn result = CVPixelBufferPoolCreate(kCFAllocatorDefault,
      (__bridge CFDictionaryRef)@{ (id)kCVPixelBufferPoolMinimumBufferCountKey: @3 },
      (__bridge CFDictionaryRef)attributes, &_outputPool);
    if (result != kCVReturnSuccess) return NULL;
    _outputSize = size;
  }
  CVPixelBufferRef output = NULL;
  CVReturn result = CVPixelBufferPoolCreatePixelBufferWithAuxAttributes(kCFAllocatorDefault, _outputPool,
    (__bridge CFDictionaryRef)@{ (id)kCVPixelBufferPoolAllocationThresholdKey: @6 }, &output);
  return result == kCVReturnSuccess ? output : NULL;
}

- (void)resetWorkerForGeneration:(uint64_t)generation {
  _workerGeneration = generation;
  _sequence = [VNSequenceRequestHandler new];
  _faceDetection = [VNDetectFaceRectanglesRequest new];
  _faceTracking = nil;
  _segmentation = [VNGeneratePersonSegmentationRequest new];
  _segmentation.qualityLevel = VNGeneratePersonSegmentationRequestQualityLevelBalanced;
  _segmentation.outputPixelFormat = kCVPixelFormatType_OneComponent8;
  _lastFaceDetection = 0;
  _hasSmoothing = NO;
}

- (void)analyze:(CIImage *)source effect:(NSString *)effect generation:(uint64_t)generation capturedAt:(double)capturedAt {
  @try {
    [_lock lock];
    BOOL enabled = _generation == generation && ![_effect isEqualToString:@"off"];
    [_lock unlock];
    if (!enabled) return;
    if (_workerGeneration != generation) [self resetWorkerForGeneration:generation];
    CGRect extent = source.extent;
    double scale = MIN(1.0, 512.0 / MAX(extent.size.width, extent.size.height));
    CIImage *input = [source imageByApplyingTransform:CGAffineTransformMakeScale(scale, scale)];
    BOOL skyline = [effect isEqualToString:@"chicago-skyline"];
    BOOL personEffect = ![effect isEqualToString:@"studio-light"];
    BOOL detect = !_faceTracking || capturedAt - _lastFaceDetection >= 1.0;
    NSMutableArray<VNRequest *> *requests = [NSMutableArray new];
    // Segmentation-only effects need no face detector or tracker. This saves
    // inference time and supports people facing away from either camera.
    if (personEffect) [requests addObject:_segmentation];
    else [requests addObject:detect ? _faceDetection : _faceTracking];
    NSError *error = nil;
    if (![_sequence performRequests:requests onCIImage:input orientation:kCGImagePropertyOrientationUp error:&error]) {
      [self recordFallback:@"vision_request_failed" state:@"error" generation:generation cooldown:0.5];
      return;
    }

    VNDetectedObjectObservation *face = nil;
    if (!personEffect && detect) {
      _lastFaceDetection = capturedAt;
      double largest = 0;
      for (VNFaceObservation *candidate in _faceDetection.results) {
        double area = candidate.boundingBox.size.width * candidate.boundingBox.size.height;
        if (candidate.confidence >= 0.60 && area > largest) {
          face = candidate;
          largest = area;
        }
      }
      _faceTracking = face ? [[VNTrackObjectRequest alloc] initWithDetectedObjectObservation:face] : nil;
      _faceTracking.trackingLevel = VNRequestTrackingLevelAccurate;
    } else if (!personEffect) {
      face = _faceTracking.results.firstObject;
      if (face.confidence < 0.60) face = nil;
      if (face) _faceTracking.inputObservation = face;
      else _faceTracking = nil;
    }
    CGRect faceBox = face ? CGRectIntersection(face.boundingBox, CGRectMake(0, 0, 1, 1)) : CGRectZero;
    if (CGRectIsNull(faceBox) || faceBox.size.width < 0.03 || faceBox.size.height < 0.03) faceBox = CGRectZero;
    if (!personEffect && CGRectIsEmpty(faceBox)) {
      [self recordFallback:@"face_not_found" state:@"starting" generation:generation cooldown:0.10];
      return;
    }

    CHCameraAnalysis *analysis = [CHCameraAnalysis new];
    analysis.generation = generation;
    analysis.capturedAt = capturedAt;
    analysis.face = faceBox;
    double centerX = CGRectIsEmpty(faceBox) ? 0.5 : CGRectGetMidX(faceBox);
    double centerY = CGRectIsEmpty(faceBox) ? 0.5 : CGRectGetMidY(faceBox);
    double luminance = 0.58;
    if (!CGRectIsEmpty(faceBox)) {
      CGRect sample = CGRectMake(faceBox.origin.x * input.extent.size.width,
        faceBox.origin.y * input.extent.size.height, faceBox.size.width * input.extent.size.width,
        faceBox.size.height * input.extent.size.height);
      sample = CGRectInset(sample, sample.size.width * 0.15, sample.size.height * 0.15);
      CIImage *average = [input imageByApplyingFilter:@"CIAreaAverage" withInputParameters:@{
        kCIInputExtentKey: [CIVector vectorWithCGRect:sample]
      }];
      uint8_t pixel[4] = { 0 };
      [_context render:average toBitmap:pixel rowBytes:4 bounds:CGRectMake(0, 0, 1, 1) format:kCIFormatRGBA8 colorSpace:_colorSpace];
      luminance = (0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2]) / 255.0;
    }
    if (personEffect) {
      VNPixelBufferObservation *observation = _segmentation.results.firstObject;
      if (!observation) {
        [self recordFallback:@"person_mask_unavailable" state:@"starting" generation:generation cooldown:0.1];
        return;
      }
      CIImage *mask = [CIImage imageWithCVPixelBuffer:observation.pixelBuffer];
      // Mask sampling also provides a subject center when a back-camera person
      // faces away. No face identity, biometric template, or frame is stored.
      uint8_t pixels[32 * 32 * 4] = { 0 };
      CIImage *smallMask = [mask imageByApplyingTransform:CGAffineTransformMakeScale(32.0 / mask.extent.size.width, 32.0 / mask.extent.size.height)];
      [_context render:smallMask toBitmap:pixels rowBytes:32 * 4 bounds:CGRectMake(0, 0, 32, 32)
        format:kCIFormatRGBA8 colorSpace:_colorSpace];
      double mass = 0, sumX = 0, sumY = 0;
      for (int y = 0; y < 32; y++) for (int x = 0; x < 32; x++) {
        double weight = pixels[(y * 32 + x) * 4] / 255.0;
        mass += weight;
        sumX += weight * (x + 0.5) / 32.0;
        sumY += weight * (y + 0.5) / 32.0;
      }
      if (mass < 32.0 * 32.0 * 0.025) {
        [self recordFallback:@"person_not_found" state:@"starting" generation:generation cooldown:0.1];
        return;
      }
      // Use the same mask centroid consistently for skyline movement; switching
      // between face and body centers would introduce jumps as a face turns.
      centerX = sumX / mass;
      centerY = sumY / mass;
      analysis.personMask = [mask imageByApplyingTransform:CGAffineTransformMakeScale(
        extent.size.width / mask.extent.size.width, extent.size.height / mask.extent.size.height)];
      if (skyline) {
        if (!_scene || !CGRectEqualToRect(_sceneExtent, extent)) {
          _scene = [[CHChicagoSkylineScene alloc] initWithExtent:extent];
          _sceneExtent = extent;
        }
        if (!_scene) {
          [self recordFallback:@"skyline_resources_unavailable" state:@"error" generation:generation cooldown:0.5];
          return;
        }
        analysis.scene = _scene;
      }
    }
    double x = CHSubjectOffset(centerX), y = CHSubjectOffset(centerY);
    _smoothedX = _hasSmoothing ? CHSmooth(_smoothedX, x, 0.20) : x;
    _smoothedY = _hasSmoothing ? CHSmooth(_smoothedY, y, 0.20) : y;
    _smoothedLuminance = _hasSmoothing ? CHSmooth(_smoothedLuminance, luminance, 0.25) : luminance;
    _hasSmoothing = YES;
    analysis.horizontalOffset = _smoothedX;
    analysis.verticalOffset = _smoothedY;
    analysis.luminance = _smoothedLuminance;

    double now = CACurrentMediaTime();
    if (now - capturedAt > CHInferenceBudget) {
      [self recordFallback:@"inference_budget_exceeded" state:@"unavailable" generation:generation cooldown:0.5];
      return;
    }
    [_lock lock];
    if (_generation == generation && ![_effect isEqualToString:@"off"]) _analysis = analysis;
    [_lock unlock];
  } @catch (__unused NSException *exception) {
    [self recordFallback:@"vision_processing_failed" state:@"error" generation:generation cooldown:0.5];
  } @finally {
    [_lock lock];
    _inferenceInFlight = NO;
    [_lock unlock];
    dispatch_semaphore_signal(CHVisionAdmissionSlot());
  }
}

- (CIImage *)applyLighting:(CIImage *)source analysis:(CHCameraAnalysis *)analysis intensity:(double)intensity {
  if (CGRectIsEmpty(analysis.face)) return nil;
  CGRect extent = source.extent;
  CGRect face = CGRectMake(analysis.face.origin.x * extent.size.width, analysis.face.origin.y * extent.size.height,
    analysis.face.size.width * extent.size.width, analysis.face.size.height * extent.size.height);
  CIImage *light = [source imageByApplyingFilter:@"CIExposureAdjust" withInputParameters:@{
    kCIInputEVKey: @(CHLightingExposure(analysis.luminance, intensity))
  }];
  light = [light imageByApplyingFilter:@"CIHighlightShadowAdjust" withInputParameters:@{
    @"inputShadowAmount": @(0.10 * intensity), @"inputHighlightAmount": @(1.0 - 0.04 * intensity)
  }];
  // A subtle warm key light with no geometry changes or beauty smoothing.
  light = [light imageByApplyingFilter:@"CIColorMatrix" withInputParameters:@{
    @"inputRVector": [CIVector vectorWithX:1.0 + 0.006 * intensity Y:0 Z:0 W:0],
    @"inputGVector": [CIVector vectorWithX:0 Y:1 Z:0 W:0],
    @"inputBVector": [CIVector vectorWithX:0 Y:0 Z:1.0 - 0.008 * intensity W:0]
  }];
  CIFilter *gradient = [CIFilter filterWithName:@"CIRadialGradient" withInputParameters:@{
    @"inputCenter": [CIVector vectorWithX:0 Y:0], @"inputRadius0": @0.35, @"inputRadius1": @1.0,
    @"inputColor0": [CIColor colorWithRed:1 green:1 blue:1],
    @"inputColor1": [CIColor colorWithRed:0 green:0 blue:0]
  }];
  CGAffineTransform transform = CGAffineTransformMakeScale(face.size.width * 0.95, face.size.height * 1.05);
  transform.tx = CGRectGetMidX(face);
  transform.ty = CGRectGetMidY(face) - face.size.height * 0.08;
  CIImage *mask = [[gradient.outputImage imageByApplyingTransform:transform] imageByCroppingToRect:extent];
  return [[light imageByApplyingFilter:@"CIBlendWithMask" withInputParameters:@{
    kCIInputBackgroundImageKey: source, kCIInputMaskImageKey: mask
  }] imageByCroppingToRect:extent];
}

- (CIImage *)applySkyline:(CIImage *)source analysis:(CHCameraAnalysis *)analysis intensity:(double)intensity {
  if (!analysis.personMask || !analysis.scene) return nil;
  CGRect extent = source.extent;
  CIImage *background = [analysis.scene imageWithHorizontalOffset:analysis.horizontalOffset
    verticalOffset:analysis.verticalOffset intensity:intensity];
  CIImage *mask = [[[analysis.personMask imageByClampingToExtent]
    imageByApplyingFilter:@"CIGaussianBlur" withInputParameters:@{
      kCIInputRadiusKey: @(CHClamp(MIN(extent.size.width, extent.size.height) * 0.0015, 0.6, 1.4))
    }] imageByCroppingToRect:extent];
  // foregroundWeight = personMask + (1 - personMask) * (1 - intensity).
  // Intensity therefore changes background replacement, never subject opacity.
  mask = [mask imageByApplyingFilter:@"CIColorMatrix" withInputParameters:@{
    @"inputRVector": [CIVector vectorWithX:intensity Y:0 Z:0 W:0],
    @"inputGVector": [CIVector vectorWithX:0 Y:intensity Z:0 W:0],
    @"inputBVector": [CIVector vectorWithX:0 Y:0 Z:intensity W:0],
    @"inputBiasVector": [CIVector vectorWithX:1 - intensity Y:1 - intensity Z:1 - intensity W:0]
  }];
  return [[source imageByApplyingFilter:@"CIBlendWithMask" withInputParameters:@{
    kCIInputBackgroundImageKey: background, kCIInputMaskImageKey: mask
  }] imageByCroppingToRect:extent];
}

- (CIImage *)applyCreativeEffect:(NSString *)effect source:(CIImage *)source analysis:(CHCameraAnalysis *)analysis intensity:(double)intensity {
  if (!analysis.personMask) return nil;
  CGRect extent = source.extent;
  double shortEdge = MIN(extent.size.width, extent.size.height);
  double strength = CHCreativeStrength(intensity);
  CIImage *person = [[[analysis.personMask imageByClampingToExtent]
    imageByApplyingFilter:@"CIGaussianBlur" withInputParameters:@{ kCIInputRadiusKey: @0.7 }]
    imageByCroppingToRect:extent];
  CIImage *background = nil;

  if ([effect isEqualToString:@"crimson-aura"] || [effect isEqualToString:@"neon-edge"]) {
    // Morphology and broad blur run on a small mask, not a full-resolution
    // camera image. Their radii and work area remain bounded at 1080p too.
    double scale = MIN(1.0, 384.0 / MAX(extent.size.width, extent.size.height));
    CIImage *workMask = [analysis.personMask imageByApplyingTransform:CGAffineTransformMakeScale(scale, scale)];
    CGRect workExtent = workMask.extent;
    CIImage *color = nil;
    CIImage *accentMask = nil;
    if ([effect isEqualToString:@"crimson-aura"]) {
      CIImage *blurred = [[[workMask imageByClampingToExtent] imageByApplyingFilter:@"CIGaussianBlur"
        withInputParameters:@{ kCIInputRadiusKey: @(CHClamp(shortEdge * scale * 0.035, 4, 18)) }]
        imageByCroppingToRect:workExtent];
      accentMask = CHScaleMask(blurred, 2.6 * strength);
      color = [[CIImage imageWithColor:[CIColor colorWithRed:0.98 green:0.025 blue:0.20]] imageByCroppingToRect:extent];
    } else {
      CIImage *expanded = [[[workMask imageByClampingToExtent] imageByApplyingFilter:@"CIMorphologyMaximum"
        withInputParameters:@{ kCIInputRadiusKey: @(CHClamp(shortEdge * scale * 0.009, 1.5, 4)) }]
        imageByCroppingToRect:workExtent];
      CIImage *inverse = [workMask imageByApplyingFilter:@"CIColorInvert"];
      CIImage *outline = [expanded imageByApplyingFilter:@"CIMultiplyCompositing" withInputParameters:@{
        kCIInputBackgroundImageKey: inverse
      }];
      CIImage *glow = [[[outline imageByClampingToExtent] imageByApplyingFilter:@"CIGaussianBlur"
        withInputParameters:@{ kCIInputRadiusKey: @3.0 }] imageByCroppingToRect:workExtent];
      accentMask = CHScaleMask([outline imageByApplyingFilter:@"CIMaximumCompositing" withInputParameters:@{
        kCIInputBackgroundImageKey: CHScaleMask(glow, 1.8)
      }], 1.3 * strength);
      CIFilter *gradient = [CIFilter filterWithName:@"CILinearGradient" withInputParameters:@{
        @"inputPoint0": [CIVector vectorWithX:extent.size.width * 0.2 Y:extent.size.height * 0.5],
        @"inputPoint1": [CIVector vectorWithX:extent.size.width * 0.8 Y:extent.size.height * 0.5],
        @"inputColor0": [CIColor colorWithRed:0.0 green:0.96 blue:1.0],
        @"inputColor1": [CIColor colorWithRed:1.0 green:0.025 blue:0.72]
      }];
      color = [gradient.outputImage imageByCroppingToRect:extent];
    }
    accentMask = [[accentMask imageByApplyingTransform:CGAffineTransformMakeScale(1.0 / scale, 1.0 / scale)]
      imageByCroppingToRect:extent];
    CIImage *base = [source imageByApplyingFilter:@"CIExposureAdjust" withInputParameters:@{ kCIInputEVKey: @(-0.22 * strength) }];
    background = [color imageByApplyingFilter:@"CIBlendWithMask" withInputParameters:@{
      kCIInputBackgroundImageKey: base, kCIInputMaskImageKey: accentMask
    }];
  } else if ([effect isEqualToString:@"spotlight"]) {
    double elapsed = CACurrentMediaTime() - _animationStart;
    CIFilter *spot = [CIFilter filterWithName:@"CIRadialGradient" withInputParameters:@{
      @"inputCenter": [CIVector vectorWithX:CHSpotlightCenterX(elapsed) * extent.size.width
                                          Y:CHSpotlightCenterY(elapsed) * extent.size.height],
      @"inputRadius0": @(shortEdge * 0.12), @"inputRadius1": @(shortEdge * 0.60),
      @"inputColor0": [CIColor colorWithRed:1 green:1 blue:1],
      @"inputColor1": [CIColor colorWithRed:0 green:0 blue:0]
    }];
    CIImage *dark = [source imageByApplyingFilter:@"CIExposureAdjust" withInputParameters:@{
      kCIInputEVKey: @(-1.65 * strength)
    }];
    CIImage *lit = [source imageByApplyingFilter:@"CIExposureAdjust" withInputParameters:@{
      kCIInputEVKey: @(0.45 * strength)
    }];
    lit = [lit imageByApplyingFilter:@"CIColorMatrix" withInputParameters:@{
      @"inputBiasVector": [CIVector vectorWithX:0.10 * strength Y:0.025 * strength Z:0.20 * strength W:0]
    }];
    background = [lit imageByApplyingFilter:@"CIBlendWithMask" withInputParameters:@{
      kCIInputBackgroundImageKey: dark, kCIInputMaskImageKey: [spot.outputImage imageByCroppingToRect:extent]
    }];
  }
  if (!background) return nil;
  // All creative work is behind the person. Restore original subject pixels
  // last, keeping facial features and the interior of the silhouette unchanged.
  // The spotlight moves continuously on a 12-second cycle; no flashing/strobe.
  return [[source imageByApplyingFilter:@"CIBlendWithMask" withInputParameters:@{
    kCIInputBackgroundImageKey: background, kCIInputMaskImageKey: person
  }] imageByCroppingToRect:extent];
}

@end
