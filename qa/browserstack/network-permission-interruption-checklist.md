# Network, Permission, And Interruption Checklist

Use BrowserStack App Automate for non-purchase cases and App Live for purchase-sheet interruption proof. Do not use coordinate taps and do not alter LiveKit authority, Premium gates, or money logic.

## Network

- Slow network app launch: app reaches root or a safe retry/loading state.
- Offline app launch: no crash, no raw network stack errors, retry copy appears where backed.
- Reconnect after failed load: force reconnect, refresh route, expected data or safe empty state appears.
- Slow deep link: route selector or denied fallback eventually appears.
- Upload interrupted: creator upload path shows safe retry/failure state, no partial public publish claim.

## Permissions

- Camera deny: Watch-Party/Live surfaces show safe denied copy; no LiveKit publish authority is granted.
- Camera allow: route can proceed only where the normal gate allows.
- Mic deny: no crash, no publish escalation, safe retry/settings copy.
- Mic allow: normal route behavior only.
- Notification deny: app remains usable and does not block launch-critical flows.
- Notification allow: no raw permission errors.

## Interruptions

- Background/foreground during app launch.
- Background/foreground during Premium route.
- Background/foreground during Platform route.
- App kill/relaunch after login.
- App kill/relaunch after deep link.
- Incoming phone/background event if BrowserStack device support exists.
- Purchase sheet interrupted: manual-assisted only; no fake completion or access grant.

## Proof

Save session links, screenshots, and logs to `/tmp/chillywood-browserstack-network-interruption-proof-YYYYMMDD-HHMMSS`.
