# CI and review assurance boundary

Keep one always-running planner and use conditional jobs rather than path-filter
skipping of a required workflow. Every applicable job must be accounted for by
an `if: always()` final summary. Documentation still runs contracts, current
truth, review head, links, diff, and final summary.

Pin actions by commit. CI/package/test-infrastructure changes cannot conceal
unrelated product scope. Review-only branches contain review records only and
never merge. A stale implementation head, missing evidence, proof substitution,
scope violation, or unresolved database drift fails closed.
