# Owner Final Actions (Not Automatable Here)

This file lists the remaining tasks requiring owner-side UI access, 2FA, or recurring physical proof.

## App Store / Credentials

1. Create and record the final App Store Connect numeric app ID for `com.chillywood.mobile`.
2. Generate or confirm App Store Connect API submission credentials for internal build upload.
3. Create and activate iOS submission-related EAS App Store Connect credentials.
4. Configure APNs key credentials (if required for iOS ordinary push + native calls rollout).
5. Complete internal TestFlight submission flow and enable internal tester availability.
6. Perform final App Store Connect reviewer notes and legal declaration completion.

## Monetization / Provider

1. Create Apple App Store product IDs from the documented manifest.
2. Create/confirm App Store subscription groups and product availability.
3. Add Apple app and iOS products to RevenueCat, map entitlements/offers.
4. Configure and validate RevenueCat iOS webhook endpoint.
5. Run Apple sandbox StoreKit tests and purchase scenarios end-to-end.

## Universal Links / Backend

1. Deploy `apple-app-site-association` at `https://chillywoodstream.com/.well-known/` and verify HTTPS response headers/content type/no redirect.
2. Verify Universal Link cold/warm/foreground routing in a physical signed build.
3. Configure and validate all required Supabase auth redirect URLs for HTTPS + custom scheme.

## Device / Runtime Proof

1. Validate physical camera permission flow and capture preview.
2. Validate microphone capture/publish and live audio routing.
3. Validate Photos selection + upload path.
4. Run two-device LiveKit audio/video proof and reconnect recovery.
5. Verify APNs foreground/background/terminated delivery.
6. Verify PushKit/CallKit two-device incoming-call lifecycle (answer/decline/cancel/timeout/lockscreen).
7. Run accessibility smoke checks on physical device (VoiceOver + Dynamic Type).
8. Capture final App Store screenshots (required device classes).
9. Perform final creator money/legal attestation approval path (owner-only).

## Deployment governance

1. Keep `iosNativeCallsEnabled` off until two-device proof and owner acceptance.
2. Keep `liveMoneyEnabled`, payouts, and cash-out flags off until legal and architecture gates are passed.

