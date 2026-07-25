# GitHub App Provider No-Merge Canary

This documentation-only canary verifies that the repository-scoped
`chillywood-level01-draft-pr-broker` GitHub App cannot merge into the protected
`codex/cognitive-level01-operationalization` branch using its installation token
alone.

The canary intentionally changes no product source, workflow, runtime,
configuration, migration, or provider setting. It must remain a draft pull
request and must not be merged.

Expected provider result:

- the App can create its isolated branch and draft pull request;
- the protected base branch still requires the configured successful checks;
- an approving human review is required;
- the App is not a ruleset bypass actor;
- force-push and branch deletion remain denied;
- an App-only merge attempt is rejected by GitHub.
