# Deep Link And Navigation Smoke

Deep-link tests must use selectors and visible safe states, not coordinate taps. Every route must avoid crashes, raw stack traces, raw SQL/provider errors, and hidden-content leaks.

Android App Links policy:

- Claimed host: `https://chillywoodstream.com`
- Claimed app-owned paths: `/auth`, `/auth-callback`, `/auth/reset-password`, `/auth/v1/verify`, `/auth/verify`, `/callback`, `/confirm`, `/reset-password`, `/v1/verify`, `/verify`, `/profile`, `/channel`, `/player`, `/spectate`, `/title`, and `/watch-party`
- Web-only paths: `/`, `/privacy`, `/terms`, `/account-deletion`, `/copyright-report`, and `/support`
- Deferred unsupported paths: `/live`, `/live-stage`, and `/invite`

Android App Links closure for `chillywoodstream.com` is complete as of Google Play internal versionCode `80`: the hosted Digital Asset Links JSON is valid, Play Console showed `All links working`, and Android 16 Play-installed device verification reported `chillywoodstream.com: verified`. For future App Links changes, prove the hosted association file again and test a Google Play-installed native build; do not sideload or use `adb install` for final proof.

| Route | Expected selector | Denied fallback | Auth behavior | Notes |
| --- | --- | --- | --- | --- |
| Home | `app-root-ready` or home-ready selector | Safe loading/empty state | Signed-out allowed where product allows | No feed reorder by algorithm flag. |
| Profile | Profile route root if available | Private/blocked shell | Signed-out sees public only | Private content hidden when denied. |
| Platform | `screen-platform` | Locked/private/subscriber-only shell | Owner sees owner mode; viewer sees viewer mode | Owner controls hidden for viewers. |
| Player | Player route root if available | Paid/private/unsafe gate | Signed-out denied where required | No raw video resolver errors. |
| Premium | `premium-screen` or `screen-premium` | Restore/sign-in/purchase-safe shell | Signed-out allowed to view safe Premium copy | Does not claim creator subscription/VIP access. |
| Subscriber Area | Subscriber area route selector if available | Subscription required shell | Subscriber allowed, non-subscriber denied | Premium must not unlock it. |
| VIP Area | VIP area route selector if available | VIP required shell | VIP allowed, subscriber-only denied | Subscription must not unlock it. |
| Event | Event route root if available | Event pass/ended/canceled shell | Scoped event pass only | No LiveKit publish/host grant. |
| Watch-Party | Watch-Party route root if available | Ticket/Premium/locked shell | Scoped ticket only | Shared player behavior unchanged. |
| Live Stage | Live stage route root if available | unavailable/denied shell | Host/approved seat rules only | LiveKit authority unchanged. |

## Cases

- Logged-out deep link opens safe auth or public fallback.
- Logged-in deep link opens the intended screen or safe denied state.
- Blocked/private/subscriber-only deep links deny without leaking hidden content.
- Invalid/stale deep links route to a safe not-found or fallback screen.
- OTA/stale app selector mismatch is classified as runtime freshness, not product regression, until fresh APK is proved.
