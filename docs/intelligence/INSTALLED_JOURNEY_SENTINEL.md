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
