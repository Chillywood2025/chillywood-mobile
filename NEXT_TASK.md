# NEXT TASK

## Admin Home Remaining Gaps

Admin Command Center Home production pass is repo-side complete for the current UI/data aggregation lane. True remaining Home-tab gaps only:

- Run physical Android proof with a normal user to confirm `/admin` remains hidden or denied and no admin Home data leaks.
- Run physical Android proof with an owner/admin/operator to confirm Home loads, refresh works, snapshot counts show real values or honest unavailable states, Needs Attention is meaningful, Connected Systems is readable, Operational Truth is clear, and quick drill-down opens relevant tabs.
- If a future lane wants one server-owned source, add a role-gated `get_admin_home_snapshot()` RPC that preserves the same truth labels; this pass safely reuses existing role-gated helpers.
- App Config Home truth can distinguish table-connected/default-row fallback only if a future read model exposes source provenance; this pass already probes `app_configurations` before claiming `Connected`.
- Recent Signals currently uses immutable admin audit rows only. A broader activity feed should wait for a backed, safe cross-source report/DMCA/live-ops/audit read model.
- Live Cost Guard remains `Observe Only` until production metrics/remediation proof connects real monitoring and explicit approved actions.
