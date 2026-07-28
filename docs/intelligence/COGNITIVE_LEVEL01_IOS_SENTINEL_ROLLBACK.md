# Cognitive Level 0/1 iOS Visual Sentinel Rollback

The iOS canary is bounded independently from Android.

If any generic predicate, detailed validator, device proof, Worker boundary,
evaluator proof, triage consumption, dedupe, replay, emergency-stop, or
sentinel-principal check fails:

1. leave or return the iOS visual switch to disabled;
2. retain the immutable failed preflight, authorization, outcome, and audit
   records;
3. keep the Android visual switch at its previously finalized state;
4. keep the shared visual switch and every provider-dependent switch disabled;
5. keep all recurring schedules disabled;
6. revoke only an iOS capability or invocation credential whose own defect or
   compromise is independently proved;
7. do not rotate the sentinel database assertion;
8. do not alter Hyperdrive, database identities, generic sanitization, user
   memory, or Level 2.

An expired preflight receipt cannot be reused. A consumed receipt cannot open a
second authorization. A failed authorization requires a fresh physical iOS
manifest and a fresh preflight receipt.

No Android evidence may be copied or reclassified as iOS evidence during
rollback or retry.
