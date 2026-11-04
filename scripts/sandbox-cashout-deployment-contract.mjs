// Explicit inventory independently traced from the immutable migration
// 20261102194000_sandbox_creator_cashout_execution.sql. These names describe
// deployment scope only; they confer no deployment or provider authority.

export const TABLES = Object.freeze([
  'private.sandbox_cashout_control',
  'private.sandbox_cashout_qualifications',
  'private.sandbox_cashout_revocations',
  'private.sandbox_cashout_executions',
  'private.sandbox_cashout_recovery_authorities',
  'private.sandbox_cashout_recovery_revocations',
  'private.sandbox_cashout_allocations',
  'private.sandbox_cashout_observations',
  'private.sandbox_cashout_simulated_return_accounting',
  'private.sandbox_cashout_merch_allocations',
  'private.sandbox_cashout_merch_simulated_returns',
]);

export const FUNCTIONS = Object.freeze([
  'private.sandbox_cashout_subject_current(uuid,uuid)',
  'private.sandbox_cashout_current_user()',
  'private.lock_sandbox_cashout_creator(uuid)',
  'private.sandbox_cashout_revoke_admission()',
  'private.sandbox_cashout_recovery_admission()',
  'private.sandbox_cashout_recovery_current(uuid,text)',
  'public.request_sandbox_creator_cashout(integer,text,uuid,uuid,integer,integer,integer)',
  'public.get_sandbox_creator_cashout_execution_context(uuid)',
  'public.claim_sandbox_creator_cashout_dispatch(uuid,text)',
  'public.cancel_undispatched_sandbox_creator_cashout(uuid)',
  'private.sandbox_cashout_enabled()',
  'private.sandbox_cashout_auction_binding(uuid,uuid)',
  'private.sandbox_cashout_source(uuid,uuid)',
  'private.sandbox_cashout_merch_source(uuid,uuid)',
  'public.record_sandbox_creator_cashout_observation(uuid,uuid,jsonb)',
  'private.hold_sandbox_cashout_changed_source()',
  'private.hold_sandbox_cashout_changed_merch()',
  'private.sandbox_cashout_summary(uuid)',
  'public.get_my_sandbox_creator_cashout_execution(uuid)',
  'public.list_my_sandbox_creator_cashout_executions()',
  'public.preview_sandbox_creator_cashout(integer,text)',
]);

// Includes the nine immutable triggers created by the migration's DO block.
// Internal foreign-key constraint triggers are represented by their constraints,
// not these explicit application-trigger identities.
export const TRIGGERS = Object.freeze([
  Object.freeze({table: 'private.sandbox_cashout_revocations', name: 'sandbox_cashout_revoke_admission'}),
  Object.freeze({table: 'private.sandbox_cashout_recovery_authorities', name: 'sandbox_cashout_recovery_admission'}),
  Object.freeze({table: 'private.sandbox_cashout_recovery_revocations', name: 'sandbox_cashout_recovery_revoke_admission'}),
  Object.freeze({table: 'public.money_access_ledger_events', name: 'hold_sandbox_cashout_changed_source'}),
  Object.freeze({table: 'public.merch_orders', name: 'hold_sandbox_cashout_changed_merch'}),
  Object.freeze({table: 'private.sandbox_cashout_qualifications', name: 'sandbox_cashout_qualifications_immutable'}),
  Object.freeze({table: 'private.sandbox_cashout_revocations', name: 'sandbox_cashout_revocations_immutable'}),
  Object.freeze({table: 'private.sandbox_cashout_allocations', name: 'sandbox_cashout_allocations_immutable'}),
  Object.freeze({table: 'private.sandbox_cashout_observations', name: 'sandbox_cashout_observations_immutable'}),
  Object.freeze({table: 'private.sandbox_cashout_simulated_return_accounting', name: 'sandbox_cashout_simulated_return_accounting_immutable'}),
  Object.freeze({table: 'private.sandbox_cashout_merch_allocations', name: 'sandbox_cashout_merch_allocations_immutable'}),
  Object.freeze({table: 'private.sandbox_cashout_merch_simulated_returns', name: 'sandbox_cashout_merch_simulated_returns_immutable'}),
  Object.freeze({table: 'private.sandbox_cashout_recovery_authorities', name: 'sandbox_cashout_recovery_authorities_immutable'}),
  Object.freeze({table: 'private.sandbox_cashout_recovery_revocations', name: 'sandbox_cashout_recovery_revocations_immutable'}),
]);

export const EXISTING_SOURCE_TABLES = Object.freeze([
  'public.money_access_ledger_events',
  'public.merch_orders',
]);

export const AUTHENTICATED_FUNCTIONS = Object.freeze([
  'public.get_my_sandbox_creator_cashout_execution(uuid)',
  'public.list_my_sandbox_creator_cashout_executions()',
  'public.preview_sandbox_creator_cashout(integer,text)',
  'public.request_sandbox_creator_cashout(integer,text,uuid,uuid,integer,integer,integer)',
  'public.cancel_undispatched_sandbox_creator_cashout(uuid)',
]);

export const SERVICE_FUNCTIONS = Object.freeze([
  'public.get_sandbox_creator_cashout_execution_context(uuid)',
  'public.claim_sandbox_creator_cashout_dispatch(uuid,text)',
  'public.record_sandbox_creator_cashout_observation(uuid,uuid,jsonb)',
]);
