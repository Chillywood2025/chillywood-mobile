# Chi'llywood App Upstream Doctrine / Readiness

## 1. Purpose
This document defines what `app upstream` honestly means for Chi'llywood after the Hetzner LiveKit ingress lane was proved.

It is doctrine only.

It does not:
- deploy an app upstream
- move database or auth off Supabase
- replace Expo/EAS mobile delivery
- claim a broader web/backend deployment is already real

## 2. Current Architecture Truth

### 2.1 What Is Already Real
- Expo/EAS still owns mobile build and delivery.
- Supabase still owns auth, primary relational data, RLS, and current server-side function execution.
- Hetzner now owns the bounded realtime edge:
  - Caddy / TLS
  - LiveKit ingress
  - `live.chillywoodstream.com`

### 2.2 What Is Not Already Real
This repo still does not define:
- an app-owned production HTTP backend
- a Node/Express/Fastify service contract
- a Dockerfile or Compose service for a non-LiveKit app upstream
- a systemd service for a non-LiveKit app upstream
- a broader web deployment pipeline for the product surface

## 3. Current Readiness Decision

Current decision:
- `APP_UPSTREAM_READY = LATER_BOUNDED_SLICE`

This does not mean:
- a deployable app server already exists
- a broader Chi'llywood web app is ready to host on Hetzner
- Caddy should front the full product next

It means only this:
- there is no honest app-owned backend/web upstream to deploy now
- the only grounded bounded non-realtime candidate is the now-live public-static legal slice

## 4. What "App Upstream" Can Honestly Mean Now

### 4.1 Grounded Later Candidate
The only later bounded slice supported by current repo truth is:
- public legal pages

Current legal-surface readiness decision:
- `LEGAL_SURFACE_READY = YES_BOUNDED_STATIC_SLICE`

Current grounded owner files:
- `app/privacy.tsx`
- `app/terms.tsx`
- `app/account-deletion.tsx`
- `components/legal/legal-page-shell.tsx`
- `app.config.ts`
- `_lib/runtimeConfig.ts`

Grounding already present in repo truth:
- runtime config already supports external public legal URLs
- the bounded legal slice is now live at:
  - `https://live.chillywoodstream.com/privacy`
  - `https://live.chillywoodstream.com/terms`
  - `https://live.chillywoodstream.com/account-deletion`

### 4.2 Not Grounded Enough Yet
These are not currently honest app-upstream targets:
- a broader app backend
- an app-owned API server
- a full web app deployment
- an SSR/SPA shell for the product
- support as a host-served public upstream
- status as a host-served public upstream

Support is not yet a clean static/public slice because the current owner still depends on:
- signed-in support flows
- beta/support feedback submission
- current in-app session and workflow truth

Status is not yet a real slice because the repo does not currently contain a canonical public status-page owner.

## 5. What Would Be Fabricated If We Deployed Now
The following would be made up if opened as a deployment lane today:
- pretending the repo already has a deployable app server
- pretending the current Expo/mobile app already has a host-served web contract
- pretending support is a static public destination when its current owner still includes signed-in feedback flows
- pretending a status surface exists without a real owner
- pretending Caddy should front a broader Chi'llywood product upstream next

## 6. Exact Prerequisites Before Any Honest App-Upstream Deployment Pass

Before any later deployment-prep pass begins, Chi'llywood needs all of the following:

1. Choose one bounded slice only.
   For current repo truth, that means legal pages first or nothing.

2. Define the output contract.
   The repo must explicitly define how those legal pages become hostable static assets.

3. Define the delivery contract.
   The repo must explicitly define:
   - artifact generation
   - target host path
   - Caddy host/path ownership
   - rollback path

4. Keep app/backend ownership unchanged.
   Supabase, auth, data, and functions stay external.

5. Keep support/status deferred unless their owners become real and host-safe.

## 7. Recommended Next Lane
The bounded legal slice is now closed enough to move on.

If infra work resumes later, the next exact lane should be:
- `release hardening later`

That later lane should still not:
- deploy a broader app upstream
- move database/auth
- replace Expo/EAS delivery
- invent a status/support host without real owner truth
