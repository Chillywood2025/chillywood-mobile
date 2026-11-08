# Inactive native R2 transport

`r2-native.mjs` is a separate Worker-compatible library. It has no HTTP handler,
Wrangler deployment file, tunnel, credential loader or provider provisioning.
The existing S3 transport and SQL/current-access contract remain unchanged.

The server configures `createPrivateR2NativeTransport({binding,bucket,routeId})`
with a real private native R2 binding only after separate qualification. Objects
must carry exactly:

```ts
{
  provider: 'cloudflare_r2', bucket: string, routeId: UUID,
  objectKey: string, incarnation: UUID,
  expectedSha256: string, expectedByteLength: number,
  // Required for delivery; optional for first complete scanner read.
  identity?: {
    kind: 'r2-native-upload-v1', nativeVersion: string, etag: string
  }
}
```

Keys must match the server resource/asset/incarnation namespace and the configured
route. S3 `objectVersion`, URL, user bucket overrides and extra object fields
reject. `nativeVersion` comes from the native R2 result associated with the
returned bytes. It is never synthesized from an ETag or treated as an S3 version
query parameter. ETag is a conditional-read guard, not whole-content evidence.

The methods are `writeOnce`, `readForScan` and `readRange`. Conditional creation
uses `If-None-Match:*` and full-byte SHA256; unknown write outcomes remain unknown.
`readForScan` buffers at most16MiB and computes actual SHA256. `readRange` requires
the exact native upload identity on the actual returned body, enforces exact
range/length, and buffers at most512KiB. A same-content replacement still changes
the native upload identity and must fail. There is no overwrite, list, delete,
presigned URL, cache or old-version fallback method.

`deliverBoundedR2Range` requires a distinct private authorization response:

```ts
{
  protocol: 'scpv-current-access-r2-v1',
  actor: { userId: UUID, sessionGeneration: UUID },
  resourceId: string, grantId: string, receiptId: string,
  originalTransactionId: string, customerId: string, projectId: string,
  validUntilMs: number, // current and at most five seconds ahead
  object: R2ObjectBindingWithIdentity
}
```

The callback runs before R2 I/O and after buffering. Both responses must bind
the same actor, receipt/grant, provider project/customer/original and exact object
identity, and the original five-second deadline still applies. The future RPC
must consume actual current account/session/grant/media and Test Store holds;
synthetic callback controls in the tests are not that implementation. The output
is an authenticated range with private `no-store` headers. Previously received
player bytes remain outside revocation guarantees.

The R2 API does not supply an AbortSignal for these operations. A local timeout
does not establish cancellation or writer drain. Late read bodies are discarded;
lost writes are not retried or claimed successful. Object retention and any
eventual cleanup require a separate design and authorization.

`r2-native.test.mjs --runtime /absolute/private/miniflare-install` runs pinned
Miniflare4.20260730.0 and its actual local workerd R2 binding with external network
disabled. It verifies full-byte readback, conditional conflicts, real native
version change on same-byte replacement, bounded range delivery, current pre/post
hold controls and lost acknowledgments. Local emulation is **not Cloudflare
provider qualification**. It does not establish a live bucket/binding, token,
deployable Worker, typed scanner-ingress/publication SQL, app playback or release.

The future typed scanner evidence/publication/current-access extension needs
combined integration and actual provider tests before this adapter can be wired.
The frozen S3 authoring captures remain valid and unchanged.
