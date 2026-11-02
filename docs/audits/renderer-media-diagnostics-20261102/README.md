# Media matrix failure: preserved evidence and bounded diagnostics

The original combined focused run on integrated source
`50f5794b0c6914f880a204e0f8e6a94daace2a5e` reported153passed/1failed.
Its seek test file failed after37490ms with only `'test failed'` at file scope;
the first three seek tests passed, and the matrix emitted no final diagnostics.
`original-focused-failure.log` preserves that failure, not a sanitized rerun.

A read-only isolated TAP invocation of the **same integrated source** passed
4/4groups including all21comparisons in39845ms. Its per-case decoded hashes and
aligned PCM errors match the earlier receipt. See `same-source-isolated.tap`.
This does not explain or invalidate the original failure. No signal/exitCode
was retained by the original spec reporter. Current cgroup files are unavailable,
so OOM cannot be established retrospectively. The original command had no shell
deadline, test-timeout override, or known concurrent heavy workload.

The narrow correction changes test diagnostics only:

- Compare video byte counts and `Buffer.equals` exactly as before, but attach
  only the first differing byte/offset to a failure. Avoid asking Node's test
  IPC/reporter to serialize two multi-megabyte actual/expected Buffers. This is
  an identified diagnostic hazard, **not a proven cause** of the original failure.
- Negative controls alter the first, middle and final bytes of a2MiB buffer;
  each must fail with a bounded message and no Buffer assertion payload. Different
  lengths still fail. Equal bytes still pass.
- The same21media cases are named subtests, retaining completed case results
  before a later failure. Pixel equality, audio tolerance, timestamp checks,
  source immutability, output decode, fixture bounds and180s deadline are unchanged.

No production renderer code changes, skipped fixtures, timeout increases,
memory-cap changes, or new production qualification claims are involved.
Combined TAP follow-up results must be recorded separately; a subsequent pass
must not be described as proof of the original termination's cause.
