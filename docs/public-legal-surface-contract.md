# Chi'llywood Public Legal Surface Contract

## 1. Purpose
This document defines what a host-served public legal surface would mean for Chi'llywood after the Hetzner LiveKit ingress lane was proved and the broader app-upstream doctrine was narrowed.

It is a bounded contract only.

It does not:
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

### 2.4 Current Live Host Truth
The bounded public legal slice is now actually live on the existing Hetzner edge at:
- `https://live.chillywoodstream.com/privacy`
- `https://live.chillywoodstream.com/terms`
- `https://live.chillywoodstream.com/account-deletion`

Current serving strategy is:
- same host as the LiveKit ingress
- path-scoped static serving only for the exact legal paths
- shared `/_expo` assets and `/favicon.ico` served from the legal artifact
- all other traffic on `live.chillywoodstream.com` still reverse-proxied to LiveKit

This still does not create:
- a broader app/backend upstream
- support hosting
- status hosting

## 3. Readiness Decision

Current decision:
- `LEGAL_SURFACE_READY = YES_BOUNDED_STATIC_SLICE`

This means:
- the legal-page content owners were bounded and self-contained enough that a later static host/export slice was honest
- that slice stays fully separate from a broader app/backend upstream

Current deployment truth:
- `LEGAL_SURFACE_DEPLOYED = YES`
- the bounded static slice is now proved live on the current host/path strategy

This does not mean:
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

Current public-hosted destinations are:
- `https://live.chillywoodstream.com/privacy`
- `https://live.chillywoodstream.com/terms`
- `https://live.chillywoodstream.com/account-deletion`

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

## 7. Deployment Contract That Is Now Proved
The bounded legal deployment contract is now:

1. Static output contract.
   Use `expo export --platform web` as the renderer, then prune the artifact down to:
   - `/privacy`
   - `/terms`
   - `/account-deletion`
   - shared `/_expo` assets
   - `/favicon.ico`

2. Host/path contract.
   Serve the legal slice on the existing LiveKit host as:
   - `/privacy`
   - `/terms`
   - `/account-deletion`

3. Caddy ownership contract.
   Caddy serves only the exact legal/static paths from disk, and falls back to the existing LiveKit reverse proxy for everything else.

4. Runtime URL contract.
   Runtime legal defaults now point at the live HTTPS paths above.

5. Rollback contract.
   If the bounded legal slice regresses later, legal URL overrides can still be controlled through the existing runtime env contract without opening a broader app-upstream lane.

## 8. Was This Worth Doing
Yes, as a narrow convenience/compliance slice.

The live result now provides:
- browser-reachable legal URLs outside the app
- cleaner compliance/store-review references
- a bounded non-realtime use for the Hetzner edge without inventing a broader app host

## 9. Exact Next Lane
This bounded legal slice is now complete enough to close out.

If infra work resumes later, the next exact lane should be:
- `release hardening later`

It should not reopen:
- broader app hosting
- database migration
- support/status hosting

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
