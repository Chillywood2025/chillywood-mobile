# Cognitive Level 0/1 iOS Visual Sentinel Review Contract

The review-only branch must remain additive, draft, and unmerged.

Before the implementation can leave draft status, review must prove:

- P0 findings: zero;
- P1 findings: zero;
- the migration is forward-only;
- the iOS task and switch are platform-exact;
- collector and triage capabilities are iOS-only and independently scoped;
- a physical iOS manifest passes all fourteen generic predicates and the
  detailed iOS validator before authorization;
- Android evidence cannot satisfy any iOS receipt or lifecycle count;
- the existing Android live switch is the only enabled sibling allowed;
- shared and provider-dependent switches remain off;
- all recurring schedules remain off;
- emergency-stop and sentinel-principal rollback remain mandatory;
- the sentinel assertion and generic sanitizer are unchanged;
- the migration itself creates no capability, authorization, switch enablement,
  schedule, run, proof, finding, consumption, or evidence record;
- no iOS build or OTA is required unless the current TestFlight artifact lacks
  the exact source needed for observation and the Owner separately approves it.

Prior failed-closed Android evidence and review history remain immutable.
