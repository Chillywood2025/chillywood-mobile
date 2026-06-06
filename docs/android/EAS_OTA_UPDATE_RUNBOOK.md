# EAS OTA Update Runbook (Chi'llywood Mobile)

**Date:** 2026-06-06
**Project:** `chillywood-mobile`
**Project ID:** `c384ed57-5454-4e80-81ad-dcc218b8a3c8`
**EAS account:** `chillywood2025`

## Installed app contract (Play/internal)

- Package: `com.chillywood.mobile`
- Installer: `com.android.vending`
- Installed `versionName`: `1.0.0`
- Installed `versionCode`: `25` (from previous internal release)
- `runtimeVersion`: `1.0.0` (from `app.json` / `app.config.ts`)
- `updates.url`: `https://u.expo.dev/c384ed57-5454-4e80-81ad-dcc218b8a3c8`
- Native update policy: `checkAutomatically = ON_LOAD`

## Current channel/branch mapping

From `eas.json`:

- `production` profile -> channel `production`
- `preview` profile -> channel `preview`
- `development` profile -> channel `development`

From EAS:

- `branch: production` maps to `channel: production`
- `branch: preview` maps to `channel: preview`

For Play-internal builds using `versionCode 25` and package `com.chillywood.mobile`, publish to
**`production`** unless the installed build is clearly a preview/dev build.

## Safe publish command set

```bash
# confirm account
eas whoami

# confirm current production mapping
# (use branch/channel list for this device target)
eas branch:list
eas channel:list

eas update:list --branch production --platform android --limit 5
```

Publish exactly one proof/update when testing:

```bash
eas update --platform android --channel production --message "OTA delivery proof (marker YYYY-MM-DD HH:mm UTC)"
```

Do **not** publish without verifying the target channel.

## OTA proof steps (device)

1. Force-stop app.
2. Start app.
3. Confirm update logs:
   - `Update state change: Check`
   - `CheckCompleteAvailable` (if remote update exists)
   - `Download`
   - `DownloadComplete`
   - `onBackgroundUpdateFinished`
   - `UpdatesController`/`EndStartup` transition with `isUpdatePending=true`
4. Re-open app after pending download if needed.
5. Confirm either `CheckCompleteUnavailable` with no newer update available (means app is already on latest published compatible update)
   or explicit state indicating newly running update.

If `CheckCompleteAvailable`/`No update available` behavior is inconsistent with the published update, verify:

- update `runtimeVersion` matches `1.0.0`
- channel/branch is correct (`production` for Play channel)
- app version/runtime unchanged
- network access to `u.expo.dev`
- channel rollout is not constrained below current test cohort

## Why no reinstall

Uninstall/reinstall is only required when `runtimeVersion` differs from installed native build or if app was built for a different channel profile.

## Rollout safety

- Keep rollout small/targeted until confirmation.
- If needed, republish by reusing the same branch/channel and new message/commit.
- Do not increase rollout percentage without explicit proof that update applies on Play-installed builds.

## Useful checks after publish

```bash
eas update:list --branch production --platform android --limit 5

eas update:view <group-id>

eas update:list --all --platform android --limit 10
```

