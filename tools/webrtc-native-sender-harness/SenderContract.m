#import <Foundation/Foundation.h>

// Real SDK method, compiled against controlled bridge/RTC edges. The fake
// native setter can refuse a swap; the getter exposes its actual stored track.
typedef void (^RCTPromiseResolveBlock)(id value);
typedef void (^RCTPromiseRejectBlock)(NSString *code, NSString *message, NSError *error);
#define RCT_EXPORT_METHOD(method) - (void)method
#define RCTLogWarn(...) do {} while (0)

@interface RTCMediaStreamTrack : NSObject
@property(nonatomic, copy) NSString *trackId;
@property(nonatomic, copy) NSString *kind;
@end
@implementation RTCMediaStreamTrack @end

@interface RTCRtpSender : NSObject
@property(nonatomic, copy) NSString *senderId;
@property(nonatomic, strong) RTCMediaStreamTrack *storedTrack;
@property(nonatomic) BOOL nativeAccepts;
@property(nonatomic) NSInteger writes;
@property(nonatomic, strong) RTCMediaStreamTrack *track;
@end
@implementation RTCRtpSender
- (RTCMediaStreamTrack *)track { return self.storedTrack; }
- (void)setTrack:(RTCMediaStreamTrack *)track {
  self.writes++;
  if (!self.nativeAccepts || (track != nil && self.storedTrack != nil && ![track.kind isEqualToString:self.storedTrack.kind])) return;
  self.storedTrack = track;
}
@end

@interface RTCRtpTransceiver : NSObject
@property(nonatomic, strong) RTCRtpSender *sender;
@end
@implementation RTCRtpTransceiver @end
@interface RTCPeerConnection : NSObject
@property(nonatomic, strong) NSArray<RTCRtpTransceiver *> *transceivers;
@end
@implementation RTCPeerConnection @end

@interface WebRTCModule : NSObject
@property(nonatomic, strong) NSMutableDictionary<NSNumber *, RTCPeerConnection *> *peerConnections;
@property(nonatomic, strong) NSMutableDictionary<NSString *, RTCMediaStreamTrack *> *localTracks;
@end
@implementation WebRTCModule
// __ACTUAL_SDK_SENDER_METHOD__
@end

static NSInteger checked = 0, failed = 0;
static void check(BOOL ok, NSString *message) {
  checked++;
  if (!ok) { failed++; fprintf(stderr, "NATIVE_SENDER_FALSE_ACK: %s\n", message.UTF8String); }
}
@interface Fixture : NSObject
@property(nonatomic, strong) WebRTCModule *module;
@property(nonatomic, strong) RTCPeerConnection *peer;
@property(nonatomic, strong) RTCRtpSender *sender;
@property(nonatomic, strong) RTCRtpSender *audioSender;
@property(nonatomic, strong) RTCMediaStreamTrack *original;
@property(nonatomic, strong) RTCMediaStreamTrack *replacement;
@property(nonatomic, strong) RTCMediaStreamTrack *audio;
@property(nonatomic) NSInteger resolved;
@property(nonatomic) NSInteger rejected;
@end
@implementation Fixture
- (instancetype)init {
  if ((self = [super init])) {
    _module = [WebRTCModule new]; _module.peerConnections = [NSMutableDictionary new]; _module.localTracks = [NSMutableDictionary new];
    _original = [RTCMediaStreamTrack new]; _original.trackId = @"original"; _original.kind = @"video";
    _replacement = [RTCMediaStreamTrack new]; _replacement.trackId = @"replacement"; _replacement.kind = @"video";
    _audio = [RTCMediaStreamTrack new]; _audio.trackId = @"audio"; _audio.kind = @"audio";
    _sender = [RTCRtpSender new]; _sender.senderId = @"video"; _sender.nativeAccepts = YES; _sender.storedTrack = _original;
    _audioSender = [RTCRtpSender new]; _audioSender.senderId = @"audio"; _audioSender.nativeAccepts = YES; _audioSender.storedTrack = _audio;
    RTCRtpTransceiver *videoTransceiver = [RTCRtpTransceiver new]; videoTransceiver.sender = _sender;
    RTCRtpTransceiver *audioTransceiver = [RTCRtpTransceiver new]; audioTransceiver.sender = _audioSender;
    _peer = [RTCPeerConnection new]; _peer.transceivers = @[videoTransceiver, audioTransceiver];
    _module.peerConnections[@42] = _peer; _module.localTracks[@"replacement"] = _replacement; _module.localTracks[@"audio"] = _audio;
  }
  return self;
}
- (void)invoke:(NSString *)track {
  @try {
    [self.module senderReplaceTrack:@42 senderId:@"video" trackId:track
        resolver:^(id value) { self.resolved++; }
        rejecter:^(NSString *code, NSString *message, NSError *error) { self.rejected++; }];
  } @catch (NSException *error) {
    check(NO, @"native bridge must reject rather than throw across its promise boundary");
  }
}
- (void)rejects:(NSString *)label {
  check(self.rejected == 1 && self.resolved == 0, [label stringByAppendingString:@" rejects exactly once"]);
  check(self.sender.track == self.original, [label stringByAppendingString:@" preserves actual prior sender track"]);
  check(self.audioSender.track == self.audio && self.audioSender.writes == 0, [label stringByAppendingString:@" preserves audio"]);
}
@end

int main(void) {
  @autoreleasepool {
    Fixture *refused = [Fixture new]; refused.sender.nativeAccepts = NO;
    [refused invoke:@"replacement"]; [refused rejects:@"native SetTrack refusal"];
    Fixture *wrongKind = [Fixture new]; [wrongKind invoke:@"audio"]; [wrongKind rejects:@"native kind mismatch"];
    Fixture *missingTrack = [Fixture new]; [missingTrack invoke:@"missing"]; [missingTrack rejects:@"nonnull missing track"];
    check(missingTrack.sender.writes == 0, @"missing track never clears active native sender");
    Fixture *missingPeer = [Fixture new]; [missingPeer.module.peerConnections removeAllObjects];
    [missingPeer invoke:@"replacement"]; [missingPeer rejects:@"missing peer"];
    Fixture *missingSender = [Fixture new]; missingSender.peer.transceivers = @[];
    [missingSender invoke:@"replacement"]; [missingSender rejects:@"missing sender"];
    Fixture *success = [Fixture new]; [success invoke:@"replacement"];
    check(success.resolved == 1 && success.rejected == 0, @"successful replacement resolves exactly once");
    check(success.sender.track == success.replacement, @"successful replacement installs actual video");
    check(success.audioSender.track == success.audio && success.audioSender.writes == 0, @"video replacement preserves audio");
    Fixture *clear = [Fixture new]; [clear invoke:nil];
    check(clear.resolved == 1 && clear.rejected == 0 && clear.sender.track == nil, @"explicit null clears native sender");
    Fixture *refusedClear = [Fixture new]; refusedClear.sender.nativeAccepts = NO;
    [refusedClear invoke:nil]; [refusedClear rejects:@"native rejected null clear"];
    printf("iOS SDK sender method: %ld assertions, %ld failures\n", (long)checked, (long)failed);
    return failed > 0 ? 1 : 0;
  }
}
