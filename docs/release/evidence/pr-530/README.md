# PR #530 internal qualification evidence

This directory preserves the sanitized evidence bundle from the September 27,
2026 internal OTA and two-device physical qualification of PR #530.

- Protected merge: `2d96b5396391b0822cb4e10d6b3509639be117f3`
- Source tree: `63802aa5f2c67b9bed1476252069e81413f061c7`
- Archive: `Chillywood_PR530_Evidence_2026-09-27.zip`
- Archive SHA-256: `1636b746d8bd7e974a88c83b7961240c3a68ad5504cbb850d1f2f880af5973c8`
- Matrix: 104 rows - 14 PASS, 32 FAIL, 6 AUTOMATION BLOCKED, and 52 DEPENDENCY BLOCKED
- Final classification: `NOT QUALIFIED`

The archive contains the human-readable final report, the complete result
matrix, sanitized screenshots and recordings, delivery receipts, and
`SHA256SUMS.txt` for the retained evidence files. Live automation sessions,
raw device identifiers, private provider payloads, provisioning material,
email addresses, and unneeded account, thread, room, and invite identifiers
were excluded before packaging.

Verify before use:

```sh
shasum -a 256 docs/release/evidence/pr-530/Chillywood_PR530_Evidence_2026-09-27.zip
unzip -t docs/release/evidence/pr-530/Chillywood_PR530_Evidence_2026-09-27.zip
```
