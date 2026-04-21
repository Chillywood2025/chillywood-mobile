# Chi'llywood Public Legal Surface Contract

## 1. Purpose
This document defines what a host-served public legal surface would mean for Chi'llywood after the Hetzner LiveKit ingress lane was proved and the broader app-upstream doctrine was narrowed.

It is a bounded contract only.

It does not:
- deploy the legal surfaces
- create a broader app or backend upstream
- move auth, data, or functions off Supabase
- change current app routes

## 2. Current Legal Surface Truth

### 2.1 In-Scope Owners
The only public legal owners currently grounded enough for a later host-served slice are:
- `app/privacy.tsx`
- `app/terms.tsx`
- `app/account-deletion.tsx`
- `components/legal/legal-page-shell.tsx`

These pages are:
- static content owners
- read-only
- public-facing in meaning
- free of signed-in session requirements
- free of direct Supabase reads and writes
- free of realtime, LiveKit, support-queue, or admin dependencies

### 2.2 Current Runtime URL Truth
Current runtime/legal config already supports external legal destinations through:
- `EXPO_PUBLIC_PRIVACY_POLICY_URL`
- `EXPO_PUBLIC_TERMS_OF_SERVICE_URL`
- `EXPO_PUBLIC_ACCOUNT_DELETION_URL`

Current Hetzner planning templates already acknowledge a later legal host through:
- `LEGAL_PUBLIC_HOST`

### 2.3 What Account Deletion Means Here
`app/account-deletion.tsx` is still a legal/informational page, not a self-serve deletion backend.

If hosted later, it would still mean only:
- a public explanation page
- instructions and expectations
- contact/help guidance

It would not mean:
- on-host account deletion processing
- auth cutover
- data deletion automation moving to Hetzner

## 3. Readiness Decision

Current decision:
- `LEGAL_SURFACE_READY = YES_BOUNDED_STATIC_SLICE`

This means:
- the legal-page content owners are bounded and self-contained enough that a later static host/export slice is honest
- that later slice can stay fully separate from a broader app/backend upstream

This does not mean:
- deployment should happen immediately
- a broader app upstream is now justified
- support/status hosting are ready

## 4. Exact Scope If Adopted Later
If this slice is adopted later, scope stays limited to:
- privacy
- terms
- account deletion

Canonical in-app routes remain:
- `/privacy`
- `/terms`
- `/account-deletion`

Possible later public-hosted destinations may mirror those paths on a bounded legal host, such as:
- `https://legal.example.com/privacy`
- `https://legal.example.com/terms`
- `https://legal.example.com/account-deletion`

## 5. Explicit Out Of Scope
Even if public legal hosting is adopted later, it must not imply:
- a broader product web app
- a general Chi'llywood backend on Hetzner
- support hosting
- status hosting
- Supabase auth or database migration
- LiveKit topology changes
- Expo/EAS replacement

## 6. Why This Slice Is Honest
This slice is honest because the current owners are already:
- content-first
- bounded
- non-interactive except scrolling
- independent of signed-in state
- independent of current mobile room/chat/live flows

What would still be fabricated if we tried to host more right now:
- support, because `components/system/support-screen.tsx` still depends on signed-in feedback and beta/support workflow truth
- status, because there is no canonical public status-page owner in repo truth
- a broader app/backend host, because no deployable server topology exists

## 7. What Must Happen Before Any Later Deployment Prep
Before a real deployment pass begins, Chi'llywood still needs:

1. A static output contract.
   Define exactly how these legal owners become hostable static assets.

2. A host-path contract.
   Define exact target hostnames/paths and whether one legal host or path-based routing is used.

3. A Caddy ownership contract.
   Define whether Caddy should serve the legal host directly from files, and keep that isolated from LiveKit ingress.

4. A rollback contract.
   Keep in-app legal routes and existing runtime defaults intact until hosted legal URLs are proved.

5. A publication-worthiness check.
   Confirm the public-hosted legal pages solve a real need, such as app-store/compliance/browser reachability, instead of becoming speculative infrastructure drift.

## 8. Is This Worth Doing Now
Maybe, but only as a narrow convenience/compliance slice.

It is not a blocker for:
- the current mobile product
- the current LiveKit ingress path
- the current Supabase architecture

It is only worth doing if Chi'llywood now benefits from:
- browser-reachable legal URLs outside the app
- cleaner store-review / compliance references
- a bounded non-realtime use for the Hetzner edge that does not invent a broader app host

## 9. Exact Next Lane
The next exact infra lane after this contract pass should be:
- narrow `public legal-surface deployment`

That later lane should:
- use a bounded static export artifact only for `privacy`, `terms`, and `account-deletion`
- define target public URLs
- define Caddy/static-file ownership
- stop before claiming deployment unless the artifact and host wiring are actually proved

## 10. Current Export Strategy
The current bounded export strategy is:
- use `expo export --platform web` as the content renderer
- prune the output down to:
  - `/privacy`
  - `/terms`
  - `/account-deletion`
  - shared `/_expo` web assets
- keep any later host exposure path-scoped and legal-only

This is still not a broader app-upstream deployment because:
- no broader HTML/app route set is deployed
- no app/backend server is introduced
- Caddy would continue to front LiveKit for everything outside the exact legal paths
