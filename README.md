# Chi'llywood Release Operations

Chi'llywood now supports two rollout environments:

- `closed-beta` for invite-only testing
- `public-v1` for the Android-first public release path

Sensitive flows still require signed-in accounts in both environments: watch-party rooms, communication rooms, monetization writes, channel settings, safety reports, support feedback, and admin.

## Runtime Config

Set these environment variables before local testing or CI builds:

```bash
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_BETA_OPERATOR_ALLOWLIST=user-id-or-email,user-id-or-email
EXPO_PUBLIC_BETA_ENVIRONMENT=public-v1
```

- `EXPO_PUBLIC_BETA_OPERATOR_ALLOWLIST` is the operator allowlist for `/admin`
- `EXPO_PUBLIC_BETA_ENVIRONMENT` must be either `closed-beta` or `public-v1`

## Commands

```bash
npm ci
npm run validate:runtime
npm run lint
npm run typecheck
npx expo start --clear
```

## EAS Update Rollout

Current EAS Update ownership for this repo:

- `eas.json` build profiles map directly to `development`, `preview`, and `production` channels.
- `runtimeVersion` uses the Expo `appVersion` policy, so the current runtime is `1.0.0`.
- `updates.url` points at the linked EAS project `c384ed57-5454-4e80-81ad-dcc218b8a3c8`.
- Use `preview` as the internal proof lane first, then promote to `production` only after verification.

Recommended command path:

```bash
# 1. Validate runtime/config before any publish
npm run validate:runtime

# 2. Publish the first preview update from the proved checkpoint
npx eas-cli@latest update --channel preview --message "Chi'llywood preview OTA"

# 3. Verify preview delivery
npx eas-cli@latest update:list --branch preview
npx eas-cli@latest update:view <update-group-id>

# 4. If no production build exists yet, create it before production OTA rollout
npx eas-cli@latest build --platform android --profile production --non-interactive

# 5. Start a controlled production rollout after preview verification
npx eas-cli@latest update --channel production --message "Chi'llywood production OTA" --rollout-percentage 10

# 6. Progress or inspect the rollout
npx eas-cli@latest update:edit
npx eas-cli@latest update:list --branch production

# 7. Safe recovery
npx eas-cli@latest update:rollback
npx eas-cli@latest update:revert-update-rollout
```

Delivery verification can also use the update manifest URL directly:

```bash
curl "https://u.expo.dev/c384ed57-5454-4e80-81ad-dcc218b8a3c8?runtime-version=1.0.0&channel-name=preview&platform=android"
```

## Migration Order

Apply these migrations in order against the active backend:

1. `202603230001_add_room_type_to_watch_party_rooms.sql`
2. `202603230002_create_watch_party_room_messages.sql`
3. `202603270001_create_communication_rooms.sql`
4. `202603270002_link_communication_rooms_to_watch_party.sql`
5. `202603270003_harden_watch_party_room_truth.sql`
6. `202603270004_harden_communication_room_truth.sql`
7. `202603270005_create_app_configurations.sql`
8. `202603270006_monetization_foundation.sql`
9. `202603270007_create_safety_reports.sql`
10. `202603270008_create_closed_beta_support.sql`
11. `202603270009_public_v1_feedback_policy.sql`

## Public V1 Release Notes

- Public v1 is Android-first
- Browsing can remain unsigned
- Real signed-in auth must be restored and re-verified in the actual launch build before release
- `/admin` stays protected by the runtime operator allowlist
- In-app support feedback still writes to `beta_feedback_items`
- Safety reports still write to `safety_reports`

Use [docs/public-v1-release-checklist.md](docs/public-v1-release-checklist.md) before any Android public build.

## Closed-Beta Notes

Invite-only beta access still comes from `beta_access_memberships`, and the closed-beta operations guide remains in [docs/closed-beta-rollout-support.md](docs/closed-beta-rollout-support.md).

## Build Workflows

- Closed beta preview: [.github/workflows/phase3a-manual-preview.yml](.github/workflows/phase3a-manual-preview.yml)
- Android public v1 build: [.github/workflows/manual-public-v1-release.yml](.github/workflows/manual-public-v1-release.yml)
- EAS Update rollout stays manual in this lane: validate -> preview publish -> verify -> production rollout -> rollback only if needed

## Canonical Fallback Media

- Title seed data truth: `_data/titles.ts`
- Canonical fallback sample video: `assets/videos/sample.mp4`
- Canonical fallback skyline art: `assets/images/chicago-skyline.jpg`
