# Archived Brand byte verification

This is a separate, default-off evidence protocol for an already archived Brand
incarnation that has no ordinary scan job. It does not make the object public,
restore an asset, reset its retention clock, enqueue a normal scan job, create a
deletion claim, or perform a provider deletion. Existing delivery, hold, reference,
expiry and provider-qualification gates remain in force.

## Why a separate path exists

The ordinary reference guard correctly refuses a new scan job for a removed key.
That guard is unchanged. Four private append-only ledgers hold an explicit request,
leased attempt, scanner result and sealed receipt instead. They are FORCE-RLS
tables with no ordinary or service-role direct access. Five public RPCs are
service-role-only and also verify the service-role JWT claim. No credential or
signing authority is introduced.

The request snapshots the exact asset/source/Storage incarnation, source tombstone,
asset type, original observed/removal/expiry timestamps, and removal-clock kind.
Legacy source deletion and conservative removal timestamps may differ; both are
preserved. The expiry interval remains exactly 720 hours. Positive expected size
must agree between source metadata and the exact Storage row, up to 512 MiB.

## Bounded protocol

1. An operator explicitly requests one archived asset with its current exact
   retention binding. Existing proofs, normal jobs, holds, references or claims
   prevent admission. Repeating the same request returns its immutable ID.
2. The standalone scanner accepts only one or two explicit request IDs, never
   discovers a queue or polls. The SQL gate must be enabled and the process must
   have literal ARCHIVED_BRAND_VERIFICATION_ONCE=true. Otherwise there is no
   storage request or scan. Each request has at most three lifetime attempts;
   each has a distinct immutable token and a twenty-minute lease.
3. A current attempt is rechecked before GET, after GET and after scanning. The
   fixed project/bucket/key receives one full, nonredirecting, uncached GET.
   HTTP 200, positive exact Content-Length, expected source size, complete stream
   size, no Content-Range, and identity encoding are required. The same private
   temporary bytes are SHA-256 hashed and scanned by ClamAV, then identity,
   permissions, size and digest are checked again.
4. A valid clean result includes the observed digest/size, actual process exit
   code, known engine/signature versions, duration and full-read flag. SQL rejects
   empty, partial, wrong-size, unknown-version or contradictory clean evidence.
   Malware is terminal for this request. Failure evidence is retained but cannot
   seal. The runner never retries an uncertain result/seal write.
5. Sealing revalidates the exact unheld, unclaimed incarnation and acknowledged
   clean result. It creates an immutable receipt and the existing Brand proof.
   Lost acknowledgments may be recovered idempotently while the lease is current.
   Expired unsealed work needs a new bounded attempt; it never reuses a token.

A sealed receipt remains evidence when the verification gate is subsequently off.
It is not activation authority. Existing expiry SQL separately requires its
original gates, due time, holds/references and provider qualification. If a real
permanent expiry claim later exists, the claimed-evidence adapter can preserve
the original proof after Storage metadata disappears. That SQL state is not
proof of a physical provider deletion.

## Locking and compatibility

All protocol mutations and reads use the established global reference-fence
latch before the Brand advisory lock. Source, incarnation and Storage rows use
NOWAIT after that ordering to refuse writer-trigger inversions, rather than
deadlock. No held secondary, source-reference, rendition or transcode guard is
changed.

Only the two Brand receipt-validation adapters gain a new archived-ledger branch.
Their existing OIDs are preserved, and ordinary scan validation delegates to
byte-identical predecessor bodies. Neither ordinary scanner completion nor
source scan/moderation state is changed. The standalone runner is not started by
the existing worker entrypoint or Docker CMD.

## Trust boundary and validation evidence

The existing trusted scanner's service credential can submit results. SQL checks
the immutable chain and constraints; it cannot independently prove that ClamAV
ran if that credential or scanner host is compromised. This protocol does not
claim cryptographic remote attestation or solve credential compromise.

Local PGlite tests are actual SQL composition with explicit infrastructure doubles
and synthetic scanner evidence. Runner tests execute bounded subprocess fixtures,
but those subprocesses are not ClamAV. Required CI separately builds the repository's
existing scanner Docker dependency path and runs the real ClamAV executable on
benign and EICAR bytes with a deterministic temporary test signature database.
That container has no network and does not run freshclam or the ordinary worker.
It demonstrates actual engine/process/bytes behavior, not production signature
freshness, live scanning, provider qualification or deletion.

Native PostgreSQL CI exercises observed backend lock queues, duplicate operations,
holds, expiry-claim exclusion, source/Storage inversion, crash recovery and bounded
attempts against disposable full-schema clones. A mandatory mutation control
removes NOWAIT only in its disposable clone and proves the independent row wait
is detected. The complete source database and catalog are fingerprinted unchanged.

Deployment, the new service RPC grants, enabling the SQL gate, provisioning the
runner with its existing credential and executing an actual archived scan are
separate live actions. This source change does not authorize or perform them.
