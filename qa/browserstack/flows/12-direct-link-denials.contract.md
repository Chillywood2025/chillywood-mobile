# 12 Direct-Link Denials Contract

## Purpose
Prove paid and protected direct links fail closed for logged-out, wrong-user, or unpaid users.

## Required Personas
- `unpaid_video_fan`
- `unpaid_room_fan`
- `unpaid_event_fan`
- `nonsubscriber_fan`
- `nonvip_fan`
- signed-out state

## Required Runtime
Play/internal runtime only.

## Preconditions
- Current fixture ids/routes are documented before run.
- Use only safe links without auth tokens.

## Steps
1. Signed out: open protected paid video link.
2. Signed out: open paid Party Room link.
3. Signed out: open paid event link.
4. Signed out: open channel subscription route.
5. Signed out: open VIP route.
6. Log in as unpaid/wrong-user persona.
7. Repeat direct links.
8. Confirm each route blocks with clear state and no media/room/session setup.
9. Confirm Premium does not bypass creator-purchase gates unless explicit policy says so.

## Expected Result
Direct links cannot bypass paid gates.

## Screenshots To Capture
- Paid video denial.
- Paid room denial.
- Paid event denial.
- Subscriber-only denial.
- VIP denial.
- Logged-out sign-in requirement where shown.

## Logs To Capture
- Sanitized route/access denial logs only.

## Pass Criteria
- Every protected direct link fails closed for unauthorized users.
- Paid room direct link blocks before camera/mic/membership/presence.

## Fail/Blocker Criteria
- Media source loads for unpaid user.
- Party Room initializes before paid ticket check.
- Event/subscription/VIP content opens without access.

## Device Count
One device with account switching.

## Google Play Purchase Required
No.

## Local Before BrowserStack
Yes through existing proof docs; runtime smoke still needed.
