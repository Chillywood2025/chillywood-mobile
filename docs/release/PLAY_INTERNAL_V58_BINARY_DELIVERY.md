# Play Internal v58 Binary Delivery

Play internal v58 binary delivery: Closed for build and submit to Google Play internal track.

This lane replaces the weak OTA-only proof path for the latest Chat/Live source fixes. Source fixed is not installed-app proof, and EAS Update published is not installed-app proof. The v58 App Bundle bakes the latest source into the Play-delivered binary so testers can update through Google Play internal testing.

## Build Evidence

| Field | Value |
| --- | --- |
| Build ID | `b6bbe9d0-5e32-4ef8-b611-f68acec0bd2e` |
| Profile | `production` |
| Platform | Android |
| Distribution | Store App Bundle |
| Package | `com.chillywood.mobile` |
| Version | `1.0.0` |
| versionCode | `58` |
| Runtime | `1.0.0` |
| Channel | `production` |
| Commit included | `f6869be8ed37890b564b7d6f2c818283dde923fc` |
| Commit message | `Prove play internal two phone chat live` |

EAS remote Android version source was `57` before the build and was auto-incremented to `58` for this App Bundle.

## Submit Evidence

| Field | Value |
| --- | --- |
| Submission ID | `cb94e585-4330-4ed5-999c-a240b68b1f28` |
| Submit profile | `production` |
| Google Play track | `internal` |
| Release status | `COMPLETED` |
| Submission result | Submitted to Google Play internal track |

No Play production submission happened.

## Tester Pickup

Testers must update from Google Play internal testing after the internal release is available. Do not sideload. Do not install APK. Do not uninstall, reinstall, or clear app data for this proof path.

After v58 is installed from Play internal, rerun only the affected actual-user paths:

1. Chi'lly Chat video call through the normal visible app path.
2. Receiver in-thread, elsewhere-in-app, and background/push ringing states.
3. Fullscreen RTC video fit on both physical phone sizes.
4. Live waiting-room entry with two Premium-capable clients.
5. Live host participant approve/deny/mute/remove controls.

## Artifact

Local sanitized artifact:

- `/tmp/app-play-internal-binary-delivery-20260627-222141/`

The artifact redacts signed URLs and token-like URLs. It does not include passwords, service-role keys, Supabase keys, DB URLs, LiveKit tokens, push tokens, provider secrets, signed URLs, raw storage paths, raw IPs, private messages, private evidence, tax IDs, bank details, or provider transaction/customer/order records.

## Safety Confirmation

- No physical phone sideload was used.
- No APK install was used.
- No uninstall, reinstall, or clear-data happened.
- No Play production submission happened.
- No Google Play product/base-plan mutation happened.
- No RevenueCat mapping/provider mutation happened.
- No Stripe mutation happened.
- No provider dashboard mutation happened.
- No purchases, provider refunds, payouts, cashout, withdrawals, or transfers were executed.
- No auth/RLS/Premium/chat/account-status/staff permission weakening happened.
- Current First Owner was not touched.
- `liveMoneyEnabled` remains OFF.
- Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF.

## Next Action

Install/update v58 from Google Play internal testing on both physical phones, then rerun the actual-user two-phone Chat video and Live host-control proof through normal visible paths.
