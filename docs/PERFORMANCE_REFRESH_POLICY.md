# Chi'llywood Performance Refresh Policy

Last updated: 2026-05-14

This policy controls cost-sensitive refresh behavior for Public v1. Screen refresh rate, video frame rate, and data refresh rate are separate concerns.

## Policy

- Screen refresh rate is display smoothness. Chi'llywood does not optimize the full app around 120Hz for Public v1; 60Hz support is enough.
- Video frame rate is a bandwidth, CPU, battery, and LiveKit/TURN cost driver. Live publishing defaults to 30fps and v1 live max is 30fps.
- Premium live launch quality is capped at 720p / 30fps.
- 60fps live is not a Public v1 default and must stay behind a later disabled-by-default feature flag if it is ever added.
- Free users do not get full Live First, Live Watch-Party, or Watch-Party Live access. Existing strict Premium gates remain the access owner.
- VOD policy target is 360p/480p for free playback and 720p/1080p for Premium playback when storage and delivery support a real quality ladder. The repo now has a rendition metadata table and backend playback resolver foundation; real quality enforcement still depends on actual generated renditions/transcoding/delivery proof.
- Realtime is reserved for live interaction: room presence, chat/comments, host status, room ended/kicked/blocked state, and active direct-call state.
- Non-live surfaces should load on open, refresh on focus/return where already backed, support pull-to-refresh/manual refresh where present, and use cached/read-on-demand data instead of one-second polling.

## V1 Constants

The source of truth is `_lib/performancePolicy.ts`.

| Area | V1 value |
| --- | --- |
| Live default fps | 30 |
| Live max fps | 30 |
| Premium live max quality | 720p / 30fps |
| Free VOD target | 480p max when quality ladder exists |
| Premium VOD target | 1080p max when quality ladder exists |
| Room heartbeat | 15 seconds |
| Room active membership window | 45 seconds |
| Room snapshot refresh fallback | 30 seconds |
| Room metrics refresh | 60 seconds |
| Live comment fallback refresh | 15 seconds, with realtime as the primary path |
| Home soft refresh floor | 2 minutes |
| Channel live status refresh floor | 60 seconds |
| Studio dashboard refresh floor | 2 minutes |
| Analytics refresh mode | manual / on open / cached |
| Typing throttle | 2 seconds |
| Read receipt throttle | 10 seconds |

## Current Implementation

- Watch-Party Live and Live Stage LiveKit room creation use shared v1 options with adaptive stream behavior preserved and local camera capture capped to `1280x720 @ 30fps`.
- Watch-Party Live, Live Stage, and Chi'lly Chat call heartbeats use the shared 15-second room heartbeat.
- Watch-Party Live snapshot fallback refresh is 30 seconds.
- Live Stage hybrid room comments still use Supabase realtime first; the fallback sync is 15 seconds.
- Chat read receipts are route-throttled to avoid repeated write bursts while messages are loading or sending.
- Home, Profile, Public Channel, and Channel Studio remain load-on-open/focus/manual surfaces; this lane does not add new feed polling.
- VOD quality ladder foundation lives in `docs/VOD_QUALITY_LADDER_AND_PLAYBACK_RESOLVER.md`. Player asks the resolver for allowed creator-video renditions and falls back to legacy single-file playback only when no real renditions exist.

## Guardrails

Run:

```sh
npm run guard:refresh-policy
```

The guard blocks regressions to default 60fps live, live v1 max above 30fps, Premium live above 720p, room heartbeats below 15 seconds, Home refresh below 2 minutes, Studio/analytics auto-polling below 60 seconds, missing chat throttles, and missing strict Premium live gate references.

## Pending

- Real VOD transcoding/delivery selection remains pending. The resolver foundation exists, but no fake 360p/480p/720p/1080p files are created.
- Release-device battery and bandwidth observation should be captured during final LiveKit/Premium proof.
- RevenueCat/Google Play billing proof remains separate from this policy; this policy does not fake Premium.
