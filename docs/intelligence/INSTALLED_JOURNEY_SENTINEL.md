# Installed Journey Sentinel

Status: protected Level 0/1 source surface registered; live device canary not yet
run.

Registered switch:

`cognitive_installed_journey_sentinel_enabled`

Registered service identity:

`installed_journey_sentinel`

The sentinel records bounded synthetic journeys with sanitized evidence hashes
only. It must capture expected state, maximum duration, observed state,
evidence hash, result state, and runtime identity.

Journey evidence is schema bounded. The database rejects malformed screenshot or
runtime hashes, unknown expected/observed states, impossible step counts, and
unresolved-state counts that exceed the total journey steps.

Initial journeys:

- sign in;
- relaunch/session persistence;
- Home;
- Explore;
- Search;
- Library;
- Profile;
- Settings;
- content/player;
- public profile/channel;
- chat;
- Live;
- Watch Party where available;
- loading-to-success;
- offline/permission/background cases where practical.

Detected conditions flow to product-quality triage and then collective
governance. The sentinel cannot silently patch production.

Runnable canary:

`npm run sentinel:canary:journey -- --evidence <sanitized-evidence.json>`

The evidence file must come from an installed runner and include the journey
name, expected state, observed state, bounded duration, result state, journey
step count, unresolved-state count, screenshot evidence hash, and source runtime
hash. If the current app cannot emit that telemetry without a new binary or OTA,
the canary records `NEW_BINARY_OR_OTA_REQUIRED`.
