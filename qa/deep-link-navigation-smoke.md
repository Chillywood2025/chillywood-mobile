# Deep Link And Navigation Smoke

Deep-link tests must use selectors and visible safe states, not coordinate taps. Every route must avoid crashes, raw stack traces, raw SQL/provider errors, and hidden-content leaks.

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
