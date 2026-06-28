# Actual User Proof Standard

This is the proof rule for launch and tester-readiness claims.

## Core Rule

A feature is not Closed for launch, tester readiness, or mass usage unless it is proved through the same path an actual installed-app user would use.

For mass usage, a valid proof must use the Play-internal or release installed app, normal visible user actions, real app routes/buttons/sheets, real app-created state, and the current auth, RLS, Premium, LiveKit, chat, moderation, and staff permission rules.

If Robert or a normal tester cannot reproduce the behavior in the installed app without Codex-only setup, it is not an actual-user pass.

Compatibility wording for actual-user proof guards: Actual-user proof is Closed only when Robert or a normal tester can reproduce the behavior in the Google Play internal/closed testing app through the normal visible user path.

## Required Proof Labels

Every proof must clearly say which kind of proof it is:

- Actual-user installed-app proof
- Two-client installed-app proof
- One-device installed-app proof
- Diagnostic proof only
- Backend readback only
- Harness proof only
- Controlled seeded proof only
- Provider/dashboard proof
- Static/source proof
- Partial
- Blocked

Do not use a plain Closed label unless the proof type and scope are also clear.

## Diagnostic Proof Is Not A User Pass

Diagnostic proof is useful, but it cannot replace installed-app user proof.

Examples of diagnostic-only evidence include RTC-node clients, backend readbacks, proof-created active call state, proof-created direct threads, static scans, diagnostic emulators, and test harness assertions that do not follow the installed app UI.

Diagnostic proof may support a claim. It cannot close the actual user journey by itself.

Diagnostic media proof, backend readback, pre-created thread state, pre-created call state, direct database setup, or proof harness setup may support investigation, but it must not be counted as actual-user Closed.

## No Special Setup Can Count As Normal User Proof

Proof-only setup may be used to prepare stable test accounts or controlled fixtures, but it must be labeled. It cannot be counted as proof that a normal user can perform the action.

If state is pre-created by a proof runner, the report must say so and must not call the normal user path Closed until the installed app creates or reaches that state through the expected UI path.

## Chat Call Proof Standard

Chat Call is not Closed for actual users unless the installed app proves this path:

1. User A and User B are signed into Play-internal installed apps.
2. User A opens Profile or Chi'lly Chat through the normal UI.
3. User A creates or opens the direct thread through app-backed logic under current RLS.
4. User A taps the voice/video call button.
5. User B receives the expected incoming call UI, ring, banner, notification, or active call state through normal app behavior.
6. User B joins.
7. Both devices show active call state.
8. Media/status is visible where supported.
9. End/hangup clears state on both devices.

Pre-created thread/call state, backend readback, or diagnostic media proof is not enough to call normal Chat Call Closed.

Pre-created thread/call state was not counted as actual-user Closed.

Receiver state must be labeled:

- same-thread foreground receiver: in-thread incoming call banner/sheet;
- in-app outside-thread receiver: app-wide incoming call banner or Android foreground notification;
- background/outside-app receiver: Android push notification when push registration/provider delivery is available;
- notification delivery not confirmed: caller must see a clear status instead of false success.

Manual call initiation/ringing path is tested through installed UI only when the installed app has picked up the relevant runtime update and both physical Play-internal v57 Android clients execute the normal visible path.

## Live Proof Standard

Live video participant visibility is not Closed for actual users unless installed apps prove host and participant can enter the Live flow, satisfy the required Premium/account state, appear together at the same time, and show room/roster/video/status behavior on both devices.

Actual-user Live UI proof requires the normal visible waiting-room/entry path. Premium gates and safety gates must not be bypassed or weakened. If a non-Premium user reaches an active Premium-required status gate, that is expected gate behavior, not Live-room entry proof.

RTC diagnostic media proof is not enough if installed users still hit Premium gates unexpectedly.

## Watch-Party Proof Standard

Watch-Party sync is not Closed for actual users unless installed apps prove host and participant join the same room/session, realtime callback and playback readback work where required, and both devices show the expected UI state.

Backend callback/readback alone is not enough if both installed clients do not show the expected state.

## Owner/Admin/Moderator Proof Standard

Staff and owner tools are not Closed for actual users unless installed UI access and denial paths are proved under the real permission model.

Normal users must not access staff tools. Moderators must not gain Admin or Owner power. Admin/operator users must not gain Owner or First Owner power. Owner proof accounts must not touch the current real First Owner.

Backend/RPC proof can support this claim, but installed UI proof is required before calling the real staff surface Closed.

## Money And Premium Proof Standard

Tester-visible money UX may be active, but live settlement stays off unless a separate owner-approved lane activates it.

Premium proof must use real installed UI state and a valid test entitlement/readiness path or approved tester purchase path. Provider-blocked products remain blocked until provider setup is complete.

Status/readiness screens, draft product readbacks, and sandbox fixtures cannot be called live user purchase proof.

## Mandatory Downgrade Rule

Any existing proof marked Closed must be downgraded to Partial, Diagnostic only, Harness only, Backend readback only, or Controlled seeded proof only if it does not prove the actual installed-app user path.

Passing proof scripts means the docs are internally consistent. It does not automatically mean the product works for actual users.

## Safety Requirements

- `chat_threads` RLS must not be weakened.
- Premium gates must not be bypassed or weakened.
- No service-role chat permission proof may be used as actual-user proof.
- No auth/account-status/chat permission bypass may be added.
- No physical phone sideload may be used for Play-internal installed proof.
- No Play production submission may happen in proof lanes unless explicitly approved.
- No provider mutation may happen in non-provider lanes.
- liveMoneyEnabled remains OFF unless an owner-approved live-money lane explicitly changes it.
- Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF unless an owner-approved money lane explicitly changes them.
- No secrets/tokens/private data may be committed or artifacted.

Guard wording: `chat_threads` RLS was not weakened. Premium gates were not bypassed or weakened.

## Required Questions For Future Proof Reports

Every future proof report must answer:

1. Did this use the installed app or only backend/diagnostic tools?
2. Did it follow the same visible path an actual user/tester would use?
3. Was any state pre-created that a user would normally create?
4. Were seeded accounts used only as identities, or was special state created?
5. Did realtime claims use two active clients at the same time?
6. Were RLS, auth, Premium, LiveKit, chat, account-status, and staff permissions left intact?
7. Could Robert or a normal tester reproduce this in the installed app?
8. What remains Partial or Blocked?
9. What is the honest user-facing release status?

## Launch Decision Rule

For mass usage, only actual-user installed-app proof counts as launch proof.

If the proof would not work for Robert and testers in the Play-internal app, it is not a pass.
