# Notification Delivery Operator Runbook

Status: `scoped_write_capable_guarded`

Activation: `manual_cli`; no scheduler, daemon, worker, or broad send loop is active.

## Scope

`notification_delivery_operator` monitors Expo/push delivery health, device token health, notification preference readback, delivery attempts, retry queues, money notification delivery, LiveKit live-room notifications, chat/call push notifications, and creator notification delivery.

## Safe Writes

- `notification_operator_events`
- `notification_delivery_health_snapshots`
- `notification_delivery_attempts`
- `notification_provider_sync_status`
- `notification_required_review_flags`
- `notification_duplicate_dedupe_records`
- `notification_operator_learning_state`
- autonomous approval requests

`user_push_tokens` may be disabled/revoked only after provider `DeviceNotRegistered` evidence. If evidence is missing, record a required-review flag and stop.

## Forbidden

No marketing blasts, preference bypass, owner/admin alert leakage, fake system sends, push credential mutation, broad user messaging, money/payment claims without provider proof, Premium grants, money movement, or provider product changes.

## Approval Boundary

Broad campaigns and provider push configuration changes require Level 3 owner/super-admin approval through the autonomous approval path. Execution still requires fresh preflight, exact scope match, and emergency-state check.
