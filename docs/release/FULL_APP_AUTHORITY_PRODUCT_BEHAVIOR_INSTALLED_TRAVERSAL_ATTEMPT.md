# Full App Authority Product Behavior Installed Traversal Attempt

Status: Blocked before role traversal.

Date: 2026-07-12

## Installed App Preflight

- Device: `R5CR120QCBF`
- Package: `com.chillywood.mobile`
- Installer: `com.android.vending`
- Version: `1.0.0`
- versionCode: `80`
- Runtime: `1.0.0`
- Channel: `production`
- Update ID: `019f529d-7e99-73e5-8f2d-c7d1c35d50a3`
- Update group: `8a8e9cee-bc6f-4b68-be52-8d7d80fdf212`
- EAS message: `Autonomous approval live flow`
- EAS git commit: `1cdb27ea1b0410ba8ac2aa840f1acfec6f7d6964`
- Embedded launch: `false`
- Emergency launch: `false`

## Blocker

The current source/guard sweep commit is `b1856059e4ce2acf23c43089a2795e23ef9c7927`, but the Play-installed app is running an older production OTA from `1cdb27ea1b0410ba8ac2aa840f1acfec6f7d6964`.

Later commits after the installed OTA include owner-command UI/authority, admin action registry, scoped autonomous operator registration, observability, scheduled operator status, and the full-app authority audit contract. Because of that mismatch, a role/device traversal on the current installed app would not prove the current source/guard authority contract.

No role traversal was counted as closed from this attempt.

## Safe Next Action

Publish or otherwise make available a production OTA / Play-installed build that contains the current source authority surface, then rerun the installed traversal. This attempt did not publish, roll back, sideload, `adb install`, clear app data, grant Premium, move money, mutate auth/RLS, mutate owner roles, ban/restrict users, delete content, process media, change providers, or expose secrets.

## Artifacts

Local redacted artifact directory:

- `/tmp/chillywood-installed-authority-traversal-20260712-180104`

The artifact contains package metadata, App Info diagnostics UI dumps/screenshots, EAS readback metadata, and no printed credential values.
