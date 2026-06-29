# Header Profile Avatar Flicker Fix

## Status

Source status: Closed.
Installed-app status: Pending if product requires Google Play internal v67+ actual-user proof.

## Root Cause

The shared Home / Explore / Live / Saved header profile control could mount with empty profile state during tab changes, especially when Saved remounted after its library loading state. The profile/avatar button rendered the initials fallback immediately, then replaced it with the real avatar after cached or remote profile hydration completed.

## Fix

Profile/avatar fallback must not flash while the real avatar is still loading. Last known avatar should remain visible during profile revalidation. Fallback avatar is only valid after profile loading completes and no avatar exists.

The fix adds a shared in-memory header profile snapshot for the current tab shell, exposes a local cached-profile read path, and updates the shared tab top bar to:

- render the last known profile/avatar immediately when available;
- seed the header snapshot from Home after cached and remote profile reads;
- keep the last known avatar visible while revalidating;
- show a neutral placeholder while profile state is unresolved;
- render initials fallback only after profile loading completes and no avatar exists.

## Files Changed

- `_lib/userData.ts`
- `app/(tabs)/index.tsx`
- `components/navigation/main-tab-profile-cache.ts`
- `components/navigation/main-tab-top-bar.tsx`

## Regression Notes

Home/Explore/Live/Saved header layout remains unified. Settings remains icon-only, the visible word Settings does not appear on tab top controls, Profile/avatar remains alone on the right, and Settings/Profile controls keep the v66 compact header treatment.

Source fixed is not installed-app proof. No auth/RLS/profile permission weakening happened. No provider/live-money mutation happened. liveMoneyEnabled remains OFF.
