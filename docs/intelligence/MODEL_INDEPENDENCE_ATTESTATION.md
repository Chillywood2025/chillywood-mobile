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
- counted live quorum must include at least two model families and the required
  number of distinct model-family/version pairs;
- same-provider distinct-model-family evidence remains advisory and does not
  satisfy live quorum by itself;
- same-family isolated analysis remains advisory.

Fail-closed status:

When the configured quorum cannot be satisfied, the database reports
`MODEL_INDEPENDENCE_PROVIDER_REQUIRED`. It does not fabricate independent
collective approval from repeated calls to one model/provider.

Decision binding:

Finalized governance decision manifests are rejected unless the deliberation has
verified cross-provider model-independence attestations. The two-party Owner
approval RPC also rejects finalized manifests that do not carry the verified
independence status and evidence hash.

Local proof:

- `npm run test:cognitive-model-independence`: passed.
- pgTAP verifies a single advisory model execution, same-provider
  distinct-model-family executions, and cross-provider same-family executions
  return
  `MODEL_INDEPENDENCE_PROVIDER_REQUIRED`.
- pgTAP verifies decision finalization fails before cross-provider attestations
  exist and succeeds only after verified independence evidence is present.
