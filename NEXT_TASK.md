# NEXT TASK

## Owner Security Remaining Gaps

Owner Security Center backend hardening, Supabase deployment, Android release install, and non-owner denial proof are complete.

True remaining gaps:
- Run owner-session Android proof with a safe owner proof account: Owner Security tab loads, refresh works, current-device state is readable, empty/disconnected states are distinct, and emergency actions stay locked unless the device is backend-trusted.
- Run a reversible owner-capable trusted-device drill only with an approved proof owner: trust current device if needed, prove dangerous actions require exact confirmation plus reason, perform one safe temporary-grant revoke or device-untrust mutation, verify immutable `security_audit_events`, then revert/cleanup.
- Prove failed owner/admin access-attempt rows from a staff-but-not-owner account if a safe scoped proof account is available; regular non-staff denial is already proved.
