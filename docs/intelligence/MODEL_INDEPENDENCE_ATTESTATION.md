# Model Independence Attestation

Status: source contract implemented, live provider quorum not enabled.

The migration adds immutable sanitized model execution attestations. Stored fields
are hashes, model identity metadata, timing, cost, council role, and correlation
class. The table stores no API key, provider credential, reusable token, prompt
body, or raw model output.

Independence rules:

- each counted assessment must have a distinct execution identity hash;
- copied output hashes do not count twice;
- blind first-round status is preserved;
- provider/model correlation is explicit;
- cross-provider evidence is required for live quorum;
- same-provider distinct-model-family evidence remains advisory and does not
  satisfy live quorum by itself;
- same-family isolated analysis remains advisory.

Fail-closed status:

When the configured quorum cannot be satisfied, the database reports
`MODEL_INDEPENDENCE_PROVIDER_REQUIRED`. It does not fabricate independent
collective approval from repeated calls to one model/provider.

Local proof:

- `npm run test:cognitive-model-independence`: passed.
- pgTAP verifies a single advisory model execution and same-provider
  distinct-model-family executions return
  `MODEL_INDEPENDENCE_PROVIDER_REQUIRED`.
