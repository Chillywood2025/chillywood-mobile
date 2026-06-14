# 02 Home / Explore / Library Contract

## Purpose
Prove the main viewer shell opens cleanly and discovery/library states are honest.

## Required Personas
- `normal_viewer`
- signed-out user optional

## Required Runtime
Play/internal runtime only.

## Preconditions
- App launches.
- Network is available.

## Steps
1. Open Home.
2. Confirm no crash, blank view, or fake live/money claim.
3. Open Explore.
4. Run a basic search/typeahead smoke.
5. Open a search result if available.
6. Open Library.
7. Confirm saved/empty states are honest and do not claim fake content.
8. Switch bottom tabs repeatedly and confirm stable layout.

## Expected Result
Home, Explore, and Library render stable backed or honest-empty states.

## Screenshots To Capture
- Home first view.
- Explore search/typeahead.
- Library saved/empty state.

## Logs To Capture
- Sanitized navigation/error logs only.

## Pass Criteria
- All three tabs open.
- No fake content claims.
- No layout clipping that blocks navigation.

## Fail/Blocker Criteria
- Crash/blank screen.
- Search input unusable.
- Library shows misleading fake saved/progress state.

## Device Count
One device.

## Google Play Purchase Required
No.

## Local Before BrowserStack
Yes.
