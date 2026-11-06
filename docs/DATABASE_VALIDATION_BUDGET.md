# Database validation job budget

The existing `Validation / Database` job has a **65-minute aggregate budget**.
This changes no test, SQL, lock, HTTP or subprocess deadline. Every existing
command, native proof, cron-isolation wrapper, dependency, job identity,
selection rule and required-result predicate remains mandatory and unchanged.

## Measured evidence

The successful comparison is the merged PR #682 head
`f91b17531ea76fe16e8563cd04328350693f5c5a`, not a failed automatic-access attempt:
[run 41982398674, Database job 127095418824](https://github.com/Chillywood2025/chillywood-mobile/actions/runs/41982398674/job/127095418824).
The current measurement is PR #683 head
`5dabb183e5c971b57abf9ea4282d23855e8c941e`:
[run 42203347842](https://github.com/Chillywood2025/chillywood-mobile/actions/runs/42203347842).
Both logs use UTC timestamps.

| Interval | Successful PR #682 | PR #683 measurement |
| --- | ---: | ---: |
| First runner log through pgTAP completion | 6m55s | 6m31s |
| Tracking completion through Merch/profile completion | 28s | 7m35s |
| Cashout completion through Sandbox cashout completion | 2m20s | 3m49s |
| First runner log through chat lifecycle command launch | 42m55s | 50m07s |
| Entire successful job, including cleanup | 46m01s | Not completed |

These are logged checkpoint intervals, including intervening startup/teardown,
not profiler-isolated script runtimes. The larger Merch block now proves 287
blocking schedules and 30 nonblocking controls, versus 22 blocking schedules in
the successful baseline. Sandbox cashout expanded from 33 to 50 lock schedules.
Current pgTAP passed all 6,002 tests, the Merch/profile block passed at 10:51:48,
and all six Connect schedules passed at 10:59:10. The job then exhausted its old
50-minute aggregate limit, without a recorded assertion failure. It was canceled
at 11:22:17 during chat lifecycle HTTP, about eight seconds after that command
started. The successful baseline spends about 30 seconds in that same accepted
call phase. This cancellation is not evidence of a hung test or a passing tail.

## Tail and finite allowance

Baseline chat lifecycle command launch was 2026-11-05 07:27:25.745821 UTC.
The first post-job cleanup was 07:30:27.786695, **3m02s** later; the final job log
was 07:30:31.822435, **3m06s** later. The latter endpoint conservatively includes
cleanup. That span includes completion of chat lifecycle and all nine later
top-level commands: real-peer browser/HTTP, room Realtime, Premium quarantine,
network ACL, cognitive database, activation hold, research liveness, product
sentinel and runtime-login integration. The cognitive database npm command also
performs a full local reset and invokes two child native scripts.

Current first runner log was 2026-11-06 10:32:01.735762 UTC and chat command
launch was 11:22:08.962838: **50m07s** elapsed. Adding the measured successful
tail including cleanup gives a **53m13s projection**. This exceeds 50 minutes
before any variability allowance. Applying an explicit 20% engineering allowance
gives approximately 63m52s; rounding upward to a five-minute boundary gives 65.
This allowance accommodates runner/reset variability. It is a budget decision
from one successful baseline, not a measured percentile, guarantee or claim that
the current tail has passed.

Keeping one existing mandatory job is the smallest change. Splitting lanes would
require separate database/cron lifecycles and changes to dependency/result
validation. If future measured workloads exceed this budget, investigate their
durations and isolation before changing it again. Missing, skipped, canceled,
timed-out, failed or wrong-head applicable jobs continue to block Required
Validation. Deployment, provider operations and live-money enablement are outside
this CI-only change.
