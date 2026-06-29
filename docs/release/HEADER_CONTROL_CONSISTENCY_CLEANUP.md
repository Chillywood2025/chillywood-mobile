# Header Control Consistency Cleanup

Verdict: Closed for source.

Home is the canonical header-control reference. The compact icon-only Settings gear, the compact Profile icon, their border/background treatment, size, padding, vertical alignment, edge spacing, and safe-area placement define the shared tab header design.

## Root Cause

Home used the approved header structure: Settings on the left beside `HOME`, Profile on the right. Explore, Live, and Saved used the shared `MainTabTopBar`, but that component placed both Settings and Profile in the right-side action group. That made Explore feel like it had a different Settings/Profile treatment even though the button sizes were already close to Home.

## Files Changed

- `components/navigation/main-tab-top-bar.tsx`
- `scripts/guard-navigation-terminology-policy.mjs`

## Settings Consistency Result

The shared tab top bar now mirrors Home:

- Settings is icon-only.
- The visible word Settings is not shown.
- Accessibility label remains `Settings`.
- Settings sits in the left label group beside the tab label.
- Settings uses the same compact circular border/background treatment as Home.

Aligned surfaces:

- Explore
- Live
- Saved

## Profile Consistency Result

The shared tab top bar keeps the compact Profile avatar/icon on the right, matching Home's split header structure. Explore, Live, and Saved no longer group Profile beside Settings on the right.

## Direct Thread Regression Check

The direct thread cleanup is preserved. The large `MESSAGE THREAD` / `Chat stays primary` card remains removed from source, and the thread source still contains the message scroll, composer, Voice Call, Video Call, and compact recent-call rows.

## Guard Coverage

`guard:navigation-terminology-policy` now checks that the shared tab Settings control is in a label group with the tab label, matching Home's canonical layout and preventing a return to the right-side Settings/Profile cluster.

## Proof Status

Source fixed is not installed-app proof. Google Play internal install is not enough without actual user flow proof. A future Google Play internal installed proof should confirm Home, Explore, Live, and Saved all show matching Settings/Profile header controls without overlap.

## Safety Confirmation

No auth/RLS/chat/account-status permission weakening happened. No provider/live-money mutation happened. `liveMoneyEnabled` remains OFF. No backend, migration, Premium, payout, refund, or chat-history behavior changed.
