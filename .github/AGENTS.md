# GitHub Workflow Rules

- Pull-request source workflows run without production credentials and use
  `pull_request`, never privileged `pull_request_target`, for untrusted code.
- `Chi'llywood Source Validation` computes applicability from the complete
  changed-path set and always emits `Validation / Results`.
- The protected-main publisher independently verifies the current PR head,
  base, repository identity, complete file list, expected jobs, conclusions,
  and policy authorization before publishing `Chi'llywood / Required
  Validation`.
- Do not reuse the required check name in a pull-request-controlled workflow.
- Workflow and policy changes require either a GitHub-verified personal
  repository owner as the PR author or exact-head approval from a trusted
  reviewer other than the PR author. Owner authorship is not independent
  review and must come from trusted repository and user metadata, never a
  label, comment, author association, or pull-request-controlled claim.
- Missing, failed, cancelled, timed-out, stale, or wrong-source applicable work
  fails closed. Skips are valid only when the protected planner classifies the
  job as not applicable.
- Keep release/build/submission workflows separate from ordinary source merge
  authority. They require action-specific authorization and the retained
  release review, provenance, compatibility, duplicate-submission, and rollback
  controls.
- Pin third-party actions to immutable commits and minimize permissions.
