# Paid-video hosted prerequisites

This new helper prepares dependencies only on an unprivileged GitHub-hosted
Ubuntu 24.04 amd64 job. It does not install a commerce runtime, start a Supabase
fixture, contact RevenueCat, or configure a production service. The workflow
owner must invoke it explicitly; `--plan` only prints pinned inputs.

```sh
python3 scripts/ci/paid-video-prerequisites/provision.py --plan
python3 scripts/ci/paid-video-prerequisites/provision.py \
  --repo "$GITHUB_WORKSPACE" --output "$RUNNER_TEMP/paid-video-prerequisites"
```

Run after checkout with `fetch-depth: 0`, pinned Node 20 and `npm ci`. Both
published baseline commits/trees must exist. PostgreSQL 17.6 remains the
separately qualified canonical runner prerequisite. The output manifest gives
absolute `database`, `certificates`, `deno` and prepared `httpFixture` paths.
Pass those paths to the canonical PaidVideo test runner. A success here is only
`ready-for-local-fixture-tests`; it never asserts the hosted integration passed.

The helper pins the official ClamAV 1.5.4 Linux package, detached signature,
Talos public key bytes/fingerprint and Deno 2.7.14 archive. It verifies SHA256
before use and verifies the ClamAV package with a private GnuPG keyring. The
official package installs to `/usr/local`, including its CVD trust certificate.
It does not start a daemon. FreshClam reads configuration even for `--version`,
so its private configuration is created before that version check. FFmpeg is pinned to Ubuntu's signed archive package
`7:6.1.1-3ubuntu5`; its distro dependencies remain authenticated by Apt and actual
binary versions/hashes are recorded. A removed package/version is a failure,
not permission to choose an unreviewed replacement. Missing `/usr/local/bin`
FFmpeg links may be created; existing different tools are never overwritten.
The signed FFmpeg package installation has a 20-minute (1200-second) timeout,
without retries. Apt metadata refresh keeps its separate 240-second timeout;
download, image-pull, FreshClam and other command budgets remain independent.

FreshClam is the sole signature downloader. It uses one invocation with one
attempt, a private mode-0700 directory, official mirror, full CVD downloads and
no custom URLs or mirror switching. The actual unchanged scanner code requires
exact main/daily/bytecode CVDs, external signatures verified with the package's
certificate, and daily definitions no older than 48 hours. The database cannot
be pinned indefinitely: freshness is an explicit changing prerequisite. No
private local signature database, downloaded binary, credential or log is
published or restored as a substitute.

The Deno cache is warmed as the same user with the exact HTTP lockfile and no
lock updates. It uses the default cache because the frozen HTTP runner does not
forward `DENO_DIR`. Four exact public ECR image digests are read from the
qualified HTTP profile, pulled explicitly, and checked against that profile's
successor index/platform/config identity contract. No container starts during provisioning.

Two hosted conditions are not yet proved by local source checks:

1. Shared CI egress may be rate-limited by the ClamAV CDN or public ECR. Stop and
   report the provider's response. Do not retry away a rejection, rotate IPs,
   switch mirrors, bypass download rules or accept stale definitions. An
   approved maintained signature distribution surface, if necessary, is a
   separate prerequisite and is not provisioned here.
2. The successor HTTP harness binds the raw published index, unique Linux/amd64
   manifest and config, then verifies the daemon's reference, platform and rootfs.
   Both Docker Desktop index IDs and classic Docker config IDs are accepted only
   inside that exact chain. Its source checks use all four already cached public
   image metadata chains, including the gateway; no further registry request was
   used after the observed gateway rate limit. Actual hosted image pulling and
   the full hosted run remain unproved until the job executes successfully.

Failure leaves bounded task-private evidence for the ephemeral job. Do not
upload the downloads, CVD directory, GnuPG state or logs as public artifacts.
Only source hashes, versions, signature metadata and prerequisite/test verdicts
belong in the reviewed evidence. There is no scheduler, cache service or paid
infrastructure provisioning in this helper.

Official references reviewed for this design:

- [ClamAV installation and package signature verification](https://docs.clamav.net/manual/Installing.html)
- [ClamAV 1.5 external CVD signatures and certificate options](https://blog.clamav.net/2025/10/clamav-150-released.html)
- [FreshClam supported download methods and CDN errors](https://docs.clamav.net/faq/faq-freshclam)
- [Ubuntu Noble FFmpeg package](https://packages.ubuntu.com/noble/ffmpeg)
- [Deno dependency installation and frozen lockfiles](https://docs.deno.com/runtime/reference/cli/install/)

`python3 scripts/ci/paid-video-prerequisites/provision_test.py` tests the source
boundaries with local byte fixtures. It does not claim a Linux package install,
hosted network access or actual hosted readiness.
The 24 offline groups include the retained HTTP source preflight: the pinned
repository dependencies and published baseline Git tree must already be local.
They reject changed source/template bytes and incomplete listener imports before
the provisioning step downloads packages or starts any local services.

Public ECR image pulls retry only the exact `toomanyrequests: Rate exceeded`
response (with or without Docker's daemon prefix). The identical immutable
image/platform and empty public Docker configuration are retained for at most
three attempts, with 15s/45s backoff and a 300s monotonic total budget; each pull
has at most 240s or the remaining budget. Authentication, quota/pull-limit,
manifest/digest, network and timeout failures are not retried. Every successful
pull still requires the complete pinned image-chain verification. This does not
change FreshClam's single-attempt official CDN policy.
