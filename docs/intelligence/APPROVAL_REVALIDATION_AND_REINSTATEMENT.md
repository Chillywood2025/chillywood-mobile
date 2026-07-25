# Approval Revalidation and Reinstatement

Expiration never rewrites an approval. Revalidation compares continued need,
target state, source commit, decision manifest, evidence freshness, scope, risk,
budget, tests, rollback, emergency state, conflicts, and intervening changes.

If material facts match, the service may offer
`REVALIDATE_AND_REINSTATE`. One owner action creates a new immutable version,
references the expired version, and starts a new 24-hour window.

Any objective, scope, platform, provider, target, risk, credential, budget,
rollback, production-impact, source, evidence, or test delta requires an amended
approval. Resolved, cancelled, superseded, or unnecessary work closes without
action, revokes capabilities, releases leases and budget, and cannot reuse the old
approval for another task.
