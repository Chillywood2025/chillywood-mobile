# Chi'llywood PR Checklist

## Summary
- What is changing and why?

## Scope Safety
- [ ] One focused goal for this PR
- [ ] No unrelated cleanup/refactors
- [ ] Structure-stable changes only

## Surface Impact
- [ ] Regular player impacted
- [ ] Watch party impacted
- [ ] Live stage impacted
- [ ] Watch-party live impacted
- [ ] Waiting room impacted
- [ ] Participant strip / lower shared room surfaces impacted
- [ ] No paired/shared surface impact

## Parity Review
- [ ] Parity review performed for affected paired/shared surfaces
- [ ] Parity risk and mitigation notes added below if applicable

## Verification
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] Manual sanity check completed for touched surfaces

## Checkpointing
- [ ] Working checkpoint commit created before risky changes
- [ ] Commits are clear, atomic, and reviewable

## Notes for Reviewers
- Risks, follow-ups, or rollout notes
