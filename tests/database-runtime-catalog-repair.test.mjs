// Reconstructed catalog contract after workspace rollback; all comparisons run
// against the actual full replay, not static names alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDatabase, splitSQL, merchStorefrontFiles} from './helpers/database-runtime-authority-fixture.mjs';
import {monetizationAuditFiles, monetizationImplementationFiles,
  monetizationAddedFunctionIdentities, monetizationReplacedFunctionIdentities,
  monetizationRenamedFunctionIdentities, monetizationRemovedFunctionIdentities,
} from './helpers/creator-monetization-migration-inventory.mjs';
import {profileFeedFiles, profileFeedFunctions, assertProfileFeedInventory} from './helpers/profile-feed-runtime-inventory.mjs';
import {discoveryInvalidationFiles, discoveryInvalidationFunctions, assertDiscoveryInvalidationInventory} from './helpers/discovery-invalidation-runtime-inventory.mjs';

// Explicit reviewed successors: excluded from historical delta checkpoints,
// required in full-chain repair qualification alongside their real prerequisites.
const flexibleCommerceFiles = [
  "20261030155914_creator_external_payment_capabilities.sql",
  "20261030155923_creator_subscription_catalog_bindings.sql",
  "20261030155931_creator_event_auction_engine.sql",
  "20261030155939_creator_event_auction_payment_projection.sql",
  "20261030165642_google_external_transaction_reporting.sql",
  "20261030165908_creator_room_seat_inventory.sql",
  "20261030165913_creator_room_seat_auctions.sql",
  "20261030165918_creator_room_auction_payment_projection.sql",
  "20261030182620_ios_external_checkout_admission.sql",
  "20261030182836_creator_auction_lifecycle_notifications.sql",
  "20261030184536_creator_instant_cashout_fee.sql",
  "20261030185416_creator_instant_cashout_switch_off.sql",
  "20261030185719_creator_tip_route_fee_comparison.sql",
  "20261030190222_physical_merch_net_share_terms.sql",
  "20261030190449_creator_tip_cross_rail_action_claim.sql",
  "20261030191106_physical_merch_verified_cost_observations.sql",
  "20261030193217_creator_tip_exact_selected_capability_quote.sql",
  "20261030200156_physical_merch_return_window.sql",
  "20261030200311_creator_auction_platform_settlement.sql",
  "20261030201916_merch_verified_purchase_time.sql",
  "20261030202009_merch_declared_tracking_return_terms.sql",
  "20261030202330_merch_automatic_tracking.sql",
  "20261030202414_auction_transfer_execution_boundary.sql",
  "20261030203644_creator_event_provider_coverage.sql",
  "20261030204119_event_auction_release_policy.sql",
  "20261030204252_auction_release_qualification_serialization.sql",
  "20261030204513_auction_verified_net_recovery_issuer.sql",
  "20261030210200_merch_private_fulfillment_address.sql",
  "20261030212744_merch_return_cases.sql"
];
const flexibleCommerceAddedFunctionIdentities = new Map([
  ["private.freeze_merch_return_case_protocol/0", "private.freeze_merch_return_case_protocol()"],
  ["private.guard_merch_return_case_history/0", "private.guard_merch_return_case_history()"],
  ["private.stamp_merch_return_case_hold/0", "private.stamp_merch_return_case_hold()"],
  ["private.merch_return_case_staff/0", "private.merch_return_case_staff()"],
  ["private.merch_return_case_projection/1", "private.merch_return_case_projection(private.merch_return_cases)"],
  ["private.merch_return_hold_before_cases/2", "private.merch_return_hold_before_cases(merch_orders,timestamp with time zone)"],
  ["public.merch_order_projection_before_cases/1", "merch_order_projection_before_cases(merch_orders)"],
  ["public.read_merch_return_cases/1", "read_merch_return_cases(uuid)"],
  ["public.submit_merch_return_case/4", "submit_merch_return_case(uuid,uuid,text,text)"],
  ["public.respond_merch_return_case/4", "respond_merch_return_case(uuid,uuid,text,text)"],
  ["public.list_merch_return_review_cases/1", "list_merch_return_review_cases(integer)"],
  ["private.merch_return_hold_before_fulfillment_address/2", "private.merch_return_hold_before_fulfillment_address(merch_orders,timestamp with time zone)"],
  ["private.freeze_merch_fulfillment_policy/0", "private.freeze_merch_fulfillment_policy()"],
  ["public.process_stripe_merch_before_fulfillment_address/4", "process_stripe_merch_before_fulfillment_address(text,text,text,jsonb)"],
  ["public.get_merch_fulfillment_address/1", "get_merch_fulfillment_address(uuid)"],
  ["private.merch_tracking_immutable/0", "private.merch_tracking_immutable()"],
  ["private.merch_tracking_configured/1", "private.merch_tracking_configured(uuid)"],
  ["private.merch_tracking_projection/1", "private.merch_tracking_projection(uuid)"],
  ["private.merch_return_hold_before_tracking/2", "private.merch_return_hold_before_tracking(merch_orders,timestamp with time zone)"],
  ["public.get_merch_tracking/1", "get_merch_tracking(uuid)"],
  ["public.assign_merch_tracking/3", "assign_merch_tracking(uuid,text,text)"],
  ["public.receive_merch_tracking_hint/3", "receive_merch_tracking_hint(text,text,text)"],
  ["public.claim_merch_tracking_jobs/1", "claim_merch_tracking_jobs(integer)"],
  ["public.complete_merch_tracking_job/4", "complete_merch_tracking_job(uuid,uuid,jsonb,boolean)"],
  ["public.process_stripe_merch_before_destination/4", "process_stripe_merch_before_destination(text,text,text,jsonb)"],
  ["private.freeze_merch_tracking_declaration/0", "private.freeze_merch_tracking_declaration()"],
  ["private.merch_return_hold_state_before_tracking/2", "private.merch_return_hold_state_before_tracking(merch_orders,timestamp with time zone)"],
  ["public.merch_product_projection_before_tracking/1", "merch_product_projection_before_tracking(merch_products)"],
  ["public.merch_order_projection_before_declared_price/1", "merch_order_projection_before_declared_price(merch_orders)"],
  ["public.save_creator_merch_product_with_tracking/9", "save_creator_merch_product_with_tracking(uuid,text,text,text,integer,integer,text,timestamp with time zone,text)"],
  ["public.reserve_merch_checkout_for_actor_with_tracking/9", "reserve_merch_checkout_for_actor_with_tracking(uuid,uuid,uuid,integer,uuid,uuid,text,integer,text)"],
  ["private.guard_merch_purchase_time_evidence/0", "private.guard_merch_purchase_time_evidence()"],
  ["private.merch_verified_purchase_at/1", "private.merch_verified_purchase_at(uuid)"],
  ["public.process_stripe_merch_webhook_before_purchase_time/4", "process_stripe_merch_webhook_before_purchase_time(text,text,text,jsonb)"],
  ["private.freeze_merch_return_terms/0", "private.freeze_merch_return_terms()"],
  ["private.guard_merch_return_evidence/0", "private.guard_merch_return_evidence()"],
  ["private.merch_return_hold_state/2", "private.merch_return_hold_state(merch_orders,timestamp with time zone)"],
  ["private.stamp_merch_return_hold_allocation/0", "private.stamp_merch_return_hold_allocation()"],
  ["public.merch_order_projection_before_return_policy/1", "merch_order_projection_before_return_policy(merch_orders)"],
  ["public.record_merch_provider_cost_before_return_policy/2", "record_merch_provider_cost_before_return_policy(uuid,jsonb)"],
  ["private.guard_creator_event_provider_coverage_receipt/0", "private.guard_creator_event_provider_coverage_receipt()"],
  ["private.creator_event_provider_ns/1", "private.creator_event_provider_ns(jsonb)"],
  ["private.creator_event_verified_coverage/2", "private.creator_event_verified_coverage(uuid,jsonb)"],
  ["public.record_creator_event_broadcast_provider_coverage/14", "record_creator_event_broadcast_provider_coverage(uuid,uuid,uuid,uuid,text,text,text,text,boolean,boolean,jsonb,uuid,text,text)"],
  ["private.lock_auction_release_domain/1", "private.lock_auction_release_domain(uuid)"],
  ["private.hold_auction_transfer_on_event_coverage_change/0", "private.hold_auction_transfer_on_event_coverage_change()"],
  ["private.auction_event_agreed_policy/1", "private.auction_event_agreed_policy(uuid)"],
  ["public.qualify_auction_event_release_from_domain/1", "qualify_auction_event_release_from_domain(uuid)"],
  ["private.lock_auction_release_qualification/1", "private.lock_auction_release_qualification(uuid)"],
  ["private.serialize_auction_qualification_insert/0", "private.serialize_auction_qualification_insert()"],
  ["private.hold_auction_transfer_on_recipient_change/0", "private.hold_auction_transfer_on_recipient_change()"],
  ["private.hold_auction_transfer_on_release_revocation/0", "private.hold_auction_transfer_on_release_revocation()"],
  ["public.qualify_auction_refund_recovery_from_net/1", "qualify_auction_refund_recovery_from_net(uuid)"],
  ["private.auction_recovery_evidence_current/2", "private.auction_recovery_evidence_current(uuid,uuid)"],
  ["private.guard_auction_transfer_operation/0", "private.guard_auction_transfer_operation()"],
  ["private.guard_auction_reversal_operation/0", "private.guard_auction_reversal_operation()"],
  ["private.auction_original_promise/1", "private.auction_original_promise(uuid)"],
  ["private.auction_release_mature/2", "private.auction_release_mature(uuid,uuid)"],
  ["private.observe_auction_room_delivery_issue/0", "private.observe_auction_room_delivery_issue()"],
  ["public.qualify_auction_room_release_from_domain/1", "qualify_auction_room_release_from_domain(uuid)"],
  ["private.auction_release_domain_facts/1", "private.auction_release_domain_facts(uuid)"],
  ["private.auction_release_negative_holds/1", "private.auction_release_negative_holds(uuid)"],
  ["private.hold_auction_transfer_on_payment_change/0", "private.hold_auction_transfer_on_payment_change()"],
  ["private.hold_auction_transfer_on_cost_change/0", "private.hold_auction_transfer_on_cost_change()"],
  ["public.reserve_auction_test_transfer/1", "reserve_auction_test_transfer(uuid)"],
  ["public.claim_auction_test_transfer_dispatch/1", "claim_auction_test_transfer_dispatch(uuid)"],
  ["public.read_auction_test_transfer_operation/1", "read_auction_test_transfer_operation(uuid)"],
  ["public.record_auction_test_transfer_result/2", "record_auction_test_transfer_result(uuid,jsonb)"],
  ["public.reserve_auction_test_reversal/1", "reserve_auction_test_reversal(uuid)"],
  ["public.claim_auction_test_reversal_dispatch/1", "claim_auction_test_reversal_dispatch(uuid)"],
  ["public.read_auction_test_reversal_operation/1", "read_auction_test_reversal_operation(uuid)"],
  ["public.record_auction_test_reversal_result/2", "record_auction_test_reversal_result(uuid,jsonb)"],
  ["private.auction_charge_account/3", "private.auction_charge_account(text,uuid,text)"],
  ["private.auction_contract_evidence_exact/3", "private.auction_contract_evidence_exact(text,uuid,jsonb)"],
  ["private.auction_platform_claim/6", "private.auction_platform_claim(text,uuid,uuid,uuid,uuid,boolean)"],
  ["public.prepare_creator_event_auction_platform_checkout/4", "prepare_creator_event_auction_platform_checkout(uuid,uuid,uuid,uuid)"],
  ["public.recover_creator_event_auction_platform_checkout/4", "recover_creator_event_auction_platform_checkout(uuid,uuid,uuid,uuid)"],
  ["public.revalidate_creator_event_auction_platform_checkout/4", "revalidate_creator_event_auction_platform_checkout(uuid,uuid,uuid,uuid)"],
  ["public.prepare_creator_room_auction_platform_checkout/4", "prepare_creator_room_auction_platform_checkout(uuid,uuid,uuid,uuid)"],
  ["public.recover_creator_room_auction_platform_checkout/4", "recover_creator_room_auction_platform_checkout(uuid,uuid,uuid,uuid)"],
  ["public.revalidate_creator_room_auction_platform_checkout/4", "revalidate_creator_room_auction_platform_checkout(uuid,uuid,uuid,uuid)"],
  ["public.record_auction_platform_cost_observation/2", "record_auction_platform_cost_observation(uuid,jsonb)"],
  ["public.prepare_auction_held_transfer_plan/1", "prepare_auction_held_transfer_plan(uuid)"],
  ["public.get_auction_cost_reconciliation_context/1", "get_auction_cost_reconciliation_context(uuid)"],
  ["private.advance_creator_event_auction/1", "private.advance_creator_event_auction(uuid)"],
  ["private.advance_creator_room_seat_auction/1", "private.advance_creator_room_seat_auction(uuid)"],
  ["private.assert_creator_event_auction_buyer/2", "private.assert_creator_event_auction_buyer(private.creator_event_auctions,uuid)"],
  ["private.assert_creator_room_seat_auction_buyer/2", "private.assert_creator_room_seat_auction_buyer(private.creator_room_seat_auctions,uuid)"],
  ["private.bind_auction_event_ticket_purchase_terms/0", "private.bind_auction_event_ticket_purchase_terms()"],
  ["private.bind_external_creator_tip_action/0", "private.bind_external_creator_tip_action()"],
  ["private.bind_native_creator_tip_action/0", "private.bind_native_creator_tip_action()"],
  ["private.capture_room_auction_purchase_quote/0", "private.capture_room_auction_purchase_quote()"],
  ["private.claim_creator_tip_action/8", "private.claim_creator_tip_action(uuid,uuid,uuid,uuid,integer,text,text,uuid)"],
  ["private.close_creator_room_session_on_change/0", "private.close_creator_room_session_on_change()"],
  ["private.configure_creator_auction_lifecycle/0", "private.configure_creator_auction_lifecycle()"],
  ["private.configure_google_play_external_reporter/0", "private.configure_google_play_external_reporter()"],
  ["private.creator_event_auction_grant_identity/3", "private.creator_event_auction_grant_identity(uuid,uuid,uuid)"],
  ["private.creator_event_auction_intent_exact/1", "private.creator_event_auction_intent_exact(money_purchase_intents)"],
  ["private.creator_event_auction_quote_safe_row/1", "private.creator_event_auction_quote_safe_row(private.creator_event_auction_quotes)"],
  ["private.creator_event_auction_safe_row/1", "private.creator_event_auction_safe_row(private.creator_event_auctions)"],
  ["private.creator_event_auction_source_valid/1", "private.creator_event_auction_source_valid(private.creator_event_auctions)"],
  ["private.creator_room_auction_intent_exact/1", "private.creator_room_auction_intent_exact(money_purchase_intents)"],
  ["private.creator_room_paid_seat_claim/2", "private.creator_room_paid_seat_claim(text,uuid)"],
  ["private.creator_room_seat_auction_quote_safe_row/1", "private.creator_room_seat_auction_quote_safe_row(private.creator_room_auction_quotes)"],
  ["private.creator_room_seat_auction_safe_row/1", "private.creator_room_seat_auction_safe_row(private.creator_room_seat_auctions)"],
  ["private.creator_room_seat_auction_source_valid/1", "private.creator_room_seat_auction_source_valid(private.creator_room_seat_auctions)"],
  ["private.creator_room_seat_inventory/4", "private.creator_room_seat_inventory(text,text,uuid,text)"],
  ["private.creator_room_seat_payment_verified/1", "private.creator_room_seat_payment_verified(uuid)"],
  ["private.creator_room_seat_subject_allowed/2", "private.creator_room_seat_subject_allowed(text,uuid)"],
  ["private.creator_room_session_current/1", "private.creator_room_session_current(uuid)"],
  ["private.disable_creator_auction_lifecycle/0", "private.disable_creator_auction_lifecycle()"],
  ["private.disable_google_play_external_reporter/0", "private.disable_google_play_external_reporter()"],
  ["private.enqueue_creator_auction_activity/0", "private.enqueue_creator_auction_activity()"],
  ["private.enqueue_google_play_auction_receipt/0", "private.enqueue_google_play_auction_receipt()"],
  ["private.enqueue_google_play_external_report/4", "private.enqueue_google_play_external_report(text,uuid,jsonb,text)"],
  ["private.ensure_creator_room_session/1", "private.ensure_creator_room_session(text)"],
  ["private.fulfill_native_party_ticket_hold/0", "private.fulfill_native_party_ticket_hold()"],
  ["private.google_play_external_program_ready/1", "private.google_play_external_program_ready(uuid)"],
  ["private.guard_bound_auction_product_identity/0", "private.guard_bound_auction_product_identity()"],
  ["private.guard_bound_room_auction_product_identity/0", "private.guard_bound_room_auction_product_identity()"],
  ["private.guard_creator_event_auction_quote/0", "private.guard_creator_event_auction_quote()"],
  ["private.guard_creator_event_auction_terms/0", "private.guard_creator_event_auction_terms()"],
  ["private.guard_creator_external_payment_evidence/0", "private.guard_creator_external_payment_evidence()"],
  ["private.guard_creator_room_claim_history/0", "private.guard_creator_room_claim_history()"],
  ["private.guard_creator_room_seat_auction_quote/0", "private.guard_creator_room_seat_auction_quote()"],
  ["private.guard_creator_room_seat_auction_terms/0", "private.guard_creator_room_seat_auction_terms()"],
  ["private.guard_creator_room_session_history/0", "private.guard_creator_room_session_history()"],
  ["private.guard_creator_tip_action_claim/0", "private.guard_creator_tip_action_claim()"],
  ["private.guard_ios_external_observation/0", "private.guard_ios_external_observation()"],
  ["private.guard_party_offer_inventory_floor/0", "private.guard_party_offer_inventory_floor()"],
  ["private.guard_party_ticket_reserved_inventory/0", "private.guard_party_ticket_reserved_inventory()"],
  ["private.guard_party_ticket_shared_capacity/0", "private.guard_party_ticket_shared_capacity()"],
  ["private.guard_reserved_stage_capacity/0", "private.guard_reserved_stage_capacity()"],
  ["private.lock_creator_room_inventory/1", "private.lock_creator_room_inventory(text)"],
  ["private.lowest_qualified_creator_tip_route/1", "private.lowest_qualified_creator_tip_route(jsonb)"],
  ["private.mark_native_party_checkout_claim/0", "private.mark_native_party_checkout_claim()"],
  ["private.merch_cost_append_only/0", "private.merch_cost_append_only()"],
  ["private.process_stripe_tip_webhook_lifecycle_before_google/6", "private.process_stripe_tip_webhook_lifecycle_before_google(text,uuid,uuid,jsonb,jsonb,jsonb)"],
  ["private.read_creator_tip_route_costs_for_subject/5", "private.read_creator_tip_route_costs_for_subject(uuid,uuid,uuid,integer,text)"],
  ["private.record_reserved_room_availability/0", "private.record_reserved_room_availability()"],
  ["private.reserve_auction_event_ticket_after_intent/0", "private.reserve_auction_event_ticket_after_intent()"],
  ["private.reserve_native_party_ticket/0", "private.reserve_native_party_ticket()"],
  ["private.resolve_creator_external_payment_capability/8", "private.resolve_creator_external_payment_capability(uuid,uuid,text,uuid,integer,text,text,uuid)"],
  ["private.resolve_seat_notification_activity_before_auctions/1", "private.resolve_seat_notification_activity_before_auctions(notification_activity_events)"],
  ["private.tick_creator_auctions/1", "private.tick_creator_auctions(integer)"],
  ["private.validate_selected_creator_tip_dispatch/8", "private.validate_selected_creator_tip_dispatch(uuid,uuid,uuid,uuid,integer,text,text,uuid)"],
  ["public.admit_google_play_external_session/6", "admit_google_play_external_session(text,uuid,integer,uuid,text,integer)"],
  ["public.admit_google_play_external_session/7", "admit_google_play_external_session(text,uuid,integer,uuid,text,integer,uuid)"],
  ["public.admit_ios_external_session/6", "admit_ios_external_session(text,uuid,integer,uuid,text,integer)"],
  ["public.admit_ios_external_session/7", "admit_ios_external_session(text,uuid,integer,uuid,text,integer,uuid)"],
  ["public.approve_creator_channel_subscription_catalog_binding/4", "approve_creator_channel_subscription_catalog_binding(uuid,uuid,text,text)"],
  ["public.bind_creator_event_auction_checkout/7", "bind_creator_event_auction_checkout(uuid,uuid,text,text,text,integer,text)"],
  ["public.bind_creator_room_auction_checkout/7", "bind_creator_room_auction_checkout(uuid,uuid,text,text,text,integer,text)"],
  ["public.bind_creator_subscription_offer_catalog_internal/0", "bind_creator_subscription_offer_catalog_internal()"],
  ["public.bind_google_play_external_checkout/6", "bind_google_play_external_checkout(uuid,uuid,text,uuid,text,integer)"],
  ["public.capture_creator_subscription_quote_binding_internal/0", "capture_creator_subscription_quote_binding_internal()"],
  ["public.claim_creator_event_auction_checkout/4", "claim_creator_event_auction_checkout(uuid,uuid,uuid,uuid)"],
  ["public.claim_creator_room_auction_checkout/4", "claim_creator_room_auction_checkout(uuid,uuid,uuid,uuid)"],
  ["public.claim_google_play_external_report/1", "claim_google_play_external_report(uuid)"],
  ["public.close_creator_event_auction/1", "close_creator_event_auction(uuid)"],
  ["public.close_creator_room_seat_auction/1", "close_creator_room_seat_auction(uuid)"],
  ["public.create_creator_channel_subscription_intent_pre_binding/1", "create_creator_channel_subscription_intent_pre_binding(uuid)"],
  ["public.create_creator_event_auction/7", "create_creator_event_auction(uuid,uuid,integer,integer,timestamp with time zone,timestamp with time zone,text)"],
  ["public.create_creator_event_auction_award_quote/2", "create_creator_event_auction_award_quote(uuid,uuid)"],
  ["public.create_creator_room_seat_auction/9", "create_creator_room_seat_auction(text,text,integer,integer,timestamp with time zone,timestamp with time zone,text,uuid,uuid)"],
  ["public.create_creator_room_seat_auction_award_quote/2", "create_creator_room_seat_auction_award_quote(uuid,uuid)"],
  ["public.create_ios_creator_money_intent_pre_subscription_binding/4", "create_ios_creator_money_intent_pre_subscription_binding(text,uuid,integer,jsonb)"],
  ["public.creator_money_existing_purchase_identity_pre_auction/3", "creator_money_existing_purchase_identity_pre_auction(uuid,text,uuid)"],
  ["public.creator_money_historical_purchase_identity_pre_auction/4", "creator_money_historical_purchase_identity_pre_auction(uuid,text,uuid,uuid)"],
  ["public.creator_subscription_catalog_binding_json_internal/1", "creator_subscription_catalog_binding_json_internal(creator_channel_subscription_catalog_bindings)"],
  ["public.creator_subscription_catalog_binding_ready_internal/1", "creator_subscription_catalog_binding_ready_internal(uuid)"],
  ["public.creator_subscription_price_request_self_read_internal/1", "creator_subscription_price_request_self_read_internal(uuid)"],
  ["public.event_ticket_inventory_pre_auctions_internal/1", "event_ticket_inventory_pre_auctions_internal(uuid)"],
  ["public.finish_google_play_external_report/3", "finish_google_play_external_report(uuid,uuid,jsonb)"],
  ["public.freeze_merch_net_share_terms/0", "freeze_merch_net_share_terms()"],
  ["public.get_creator_tip_amount_quote/2", "get_creator_tip_amount_quote(uuid,integer)"],
  ["public.get_creator_tip_amount_quote/3", "get_creator_tip_amount_quote(uuid,integer,uuid)"],
  ["public.get_creator_tip_route_costs/3", "get_creator_tip_route_costs(uuid,integer,text)"],
  ["public.get_merch_cost_reconciliation_context/1", "get_merch_cost_reconciliation_context(uuid)"],
  ["public.guard_bound_creator_subscription_product_internal/0", "guard_bound_creator_subscription_product_internal()"],
  ["public.guard_creator_subscription_catalog_binding_internal/0", "guard_creator_subscription_catalog_binding_internal()"],
  ["public.guard_creator_subscription_intent_binding_internal/0", "guard_creator_subscription_intent_binding_internal()"],
  ["public.ios_creator_money_store_mapping_id_pre_subscription_binding/2", "ios_creator_money_store_mapping_id_pre_subscription_binding(uuid,text)"],
  ["public.list_creator_event_auctions/1", "list_creator_event_auctions(uuid)"],
  ["public.list_creator_room_seat_auctions/1", "list_creator_room_seat_auctions(text)"],
  ["public.list_creator_supported_prices_pre_subscription_binding/4", "list_creator_supported_prices_pre_subscription_binding(text,text,text,uuid)"],
  ["public.merch_order_projection_before_cost_observation/1", "merch_order_projection_before_cost_observation(merch_orders)"],
  ["public.merch_order_projection_before_net_share/1", "merch_order_projection_before_net_share(merch_orders)"],
  ["public.money_purchase_intent_safe_row_pre_subscription_binding/1", "money_purchase_intent_safe_row_pre_subscription_binding(money_purchase_intents)"],
  ["public.place_creator_event_auction_bid/4", "place_creator_event_auction_bid(uuid,integer,uuid,uuid)"],
  ["public.place_creator_room_seat_auction_bid/4", "place_creator_room_seat_auction_bid(uuid,integer,uuid,uuid)"],
  ["public.prepare_creator_event_auction_checkout/4", "prepare_creator_event_auction_checkout(uuid,uuid,uuid,uuid)"],
  ["public.prepare_creator_room_auction_checkout/4", "prepare_creator_room_auction_checkout(uuid,uuid,uuid,uuid)"],
  ["public.prepare_creator_room_seat_auction/1", "prepare_creator_room_seat_auction(text)"],
  ["public.preserve_creator_payout_fee_terms/0", "preserve_creator_payout_fee_terms()"],
  ["public.preview_creator_cashout_fees/2", "preview_creator_cashout_fees(integer,text)"],
  ["public.preview_physical_merch_net_split/5", "preview_physical_merch_net_split(integer,integer,integer,integer,integer)"],
  ["public.process_stripe_event_auction_no_payment/2", "process_stripe_event_auction_no_payment(jsonb,text)"],
  ["public.process_stripe_event_auction_receipt/2", "process_stripe_event_auction_receipt(jsonb,text)"],
  ["public.process_stripe_room_auction_no_payment/2", "process_stripe_room_auction_no_payment(jsonb,text)"],
  ["public.process_stripe_room_auction_receipt/2", "process_stripe_room_auction_receipt(jsonb,text)"],
  ["public.read_creator_event_auction/1", "read_creator_event_auction(uuid)"],
  ["public.read_creator_event_auction_bid_eligibility/2", "read_creator_event_auction_bid_eligibility(uuid,integer)"],
  ["public.read_creator_room_seat_auction/1", "read_creator_room_seat_auction(uuid)"],
  ["public.read_creator_room_seat_auction_bid_eligibility/2", "read_creator_room_seat_auction_bid_eligibility(uuid,integer)"],
  ["public.read_creator_tip_checkout_dispatch_authority/3", "read_creator_tip_checkout_dispatch_authority(uuid,uuid,uuid)"],
  ["public.read_creator_tip_checkout_dispatch_authority_pre_shared_action/3", "read_creator_tip_checkout_dispatch_authority_pre_shared_action(uuid,uuid,uuid)"],
  ["public.read_google_play_external_reporting_health/0", "read_google_play_external_reporting_health()"],
  ["public.read_my_creator_room_seat_claims/1", "read_my_creator_room_seat_claims(text)"],
  ["public.record_creator_tip_route_fee_evidence/1", "record_creator_tip_route_fee_evidence(jsonb)"],
  ["public.record_merch_provider_cost_observation/2", "record_merch_provider_cost_observation(uuid,jsonb)"],
  ["public.recover_creator_event_auction_checkout/4", "recover_creator_event_auction_checkout(uuid,uuid,uuid,uuid)"],
  ["public.recover_creator_room_auction_checkout/4", "recover_creator_room_auction_checkout(uuid,uuid,uuid,uuid)"],
  ["public.request_creator_channel_subscription_price/2", "request_creator_channel_subscription_price(integer,text)"],
  ["public.reserve_merch_checkout_before_net_share/4", "reserve_merch_checkout_before_net_share(uuid,integer,uuid,uuid)"],
  ["public.resolve_creator_tip_payment_action/2", "resolve_creator_tip_payment_action(uuid,boolean)"],
  ["public.resolve_live_watch_party_money_access_pre_reserved_claim/2", "resolve_live_watch_party_money_access_pre_reserved_claim(text,uuid)"],
  ["public.resolve_live_watch_party_money_access_pre_reserved_ui/1", "resolve_live_watch_party_money_access_pre_reserved_ui(text)"],
  ["public.resolve_paid_watch_party_ticket_pre_reserved_claim/1", "resolve_paid_watch_party_ticket_pre_reserved_claim(text)"],
  ["public.resolve_watch_party_livekit_pre_reserved_claim/3", "resolve_watch_party_livekit_pre_reserved_claim(text,uuid,uuid)"],
  ["public.revalidate_creator_event_auction_checkout/4", "revalidate_creator_event_auction_checkout(uuid,uuid,uuid,uuid)"],
  ["public.revalidate_creator_room_auction_checkout/4", "revalidate_creator_room_auction_checkout(uuid,uuid,uuid,uuid)"],
  ["public.revoke_creator_tip_route_fee_evidence/1", "revoke_creator_tip_route_fee_evidence(uuid)"],
  ["public.select_creator_tip_payment_route/4", "select_creator_tip_payment_route(uuid,uuid,integer,text)"],
  ["public.set_creator_channel_subscription_offer_at_price_pre_binding/4", "set_creator_channel_subscription_offer_at_price_pre_binding(text,text,text,uuid)"],
  ["public.set_creator_room_participant_authority_service/7", "set_creator_room_participant_authority_service(text,uuid,uuid,uuid,text,boolean,text)"],
  ["public.watch_party_room_access_pre_reserved_claim/2", "watch_party_room_access_pre_reserved_claim(text,text)"],
]);

// Reviewed disabled inspection/deleted-retention successor bundle. Keep this
// inventory explicit so a missing or unexpected replay file still fails.
// Reviewed physical storefront/SKU/photo successor delta, measured against the
// full pre-storefront catalog. Exact identities retain overload and wrapper
// coverage; a numerical count alone cannot admit an unexpected function.
const merchAddedFunctionIdentities = new Map([
  ["private.guard_merch_photo_asset/0","private.guard_merch_photo_asset()"],
  ["private.guard_merch_photo_brand_reference/0","private.guard_merch_photo_brand_reference()"],
  ["private.guard_merch_product_photo_reference/0","private.guard_merch_product_photo_reference()"],
  ["public.approve_creator_merch_photo/3","approve_creator_merch_photo(uuid,uuid,timestamp with time zone)"],
  ["public.assign_merch_product_photo/3","assign_merch_product_photo(uuid,uuid,timestamp with time zone)"],
  ["public.check_creator_merch_photo_target/1","check_creator_merch_photo_target(uuid)"],
  ["public.configure_creator_merch_variants/4","configure_creator_merch_variants(uuid,text,jsonb,timestamp with time zone)"],
  ["public.configure_creator_merch_variants_before_photo_lock/4","configure_creator_merch_variants_before_photo_lock(uuid,text,jsonb,timestamp with time zone)"],
  ["public.discard_creator_merch_photo/1","discard_creator_merch_photo(uuid)"],
  ["public.list_creator_merch_products/4","list_creator_merch_products(uuid,boolean,uuid,integer)"],
  ["public.list_my_merch_orders/4","list_my_merch_orders(text,uuid,integer,uuid)"],
  ["public.merch_order_projection_before_variants/1","merch_order_projection_before_variants(merch_orders)"],
  ["public.merch_order_projection_internal/1","merch_order_projection_internal(merch_orders)"],
  ["public.merch_photo_public_access_allowed/1","merch_photo_public_access_allowed(uuid)"],
  ["public.merch_product_projection_before_photos_internal/1","merch_product_projection_before_photos_internal(merch_products)"],
  ["public.merch_product_projection_before_variants/1","merch_product_projection_before_variants(merch_products)"],
  ["public.merch_product_projection_internal/1","merch_product_projection_internal(merch_products)"],
  ["public.merch_seller_ready_internal/1","merch_seller_ready_internal(uuid)"],
  ["public.process_stripe_merch_webhook_before_photo_lock/4","process_stripe_merch_webhook_before_photo_lock(text,text,text,jsonb)"],
  ["public.process_stripe_merch_webhook_lifecycle_before_storefront/4","process_stripe_merch_webhook_lifecycle_before_storefront(text,text,text,jsonb)"],
  ["public.read_creator_merch_photo_status/1","read_creator_merch_photo_status(uuid)"],
  ["public.reserve_merch_checkout/3","reserve_merch_checkout(uuid,integer,uuid)"],
  ["public.reserve_merch_checkout/4","reserve_merch_checkout(uuid,integer,uuid,uuid)"],
  ["public.reserve_merch_checkout_for_actor/5","reserve_merch_checkout_for_actor(uuid,uuid,uuid,integer,uuid)"],
  ["public.reserve_merch_checkout_for_actor/6","reserve_merch_checkout_for_actor(uuid,uuid,uuid,integer,uuid,uuid)"],
  ["public.reserve_merch_checkout_for_actor_before_photo_lock/6","reserve_merch_checkout_for_actor_before_photo_lock(uuid,uuid,uuid,integer,uuid,uuid)"],
  ["public.save_creator_merch_product/8","save_creator_merch_product(uuid,text,text,text,integer,integer,text,timestamp with time zone)"],
  ["public.save_creator_merch_product_before_photo_lock/8","save_creator_merch_product_before_photo_lock(uuid,text,text,text,integer,integer,text,timestamp with time zone)"],
  ["public.save_creator_merch_product_before_variants/8","save_creator_merch_product_before_variants(uuid,text,text,text,integer,integer,text,timestamp with time zone)"],
  ["public.update_creator_merch_fulfillment/3","update_creator_merch_fulfillment(uuid,text,text)"],
]);
const merchReplacedFunctionIdentities = new Map([["public.process_stripe_merch_webhook_lifecycle/4","process_stripe_merch_webhook_lifecycle(text,text,text,jsonb)"]]);
const merchRenamedFunctionIdentities = [["process_stripe_merch_webhook_lifecycle(text,text,text,jsonb)","process_stripe_merch_webhook_lifecycle_before_storefront(text,text,text,jsonb)"]];

const brandRetentionFiles = [
  '20261021134043_platform_brand_exact_retention_lifecycle.sql',
  '20261021134053_media_scan_exact_byte_receipts.sql',
  '20261021134104_platform_brand_exact_expiry_transport.sql',
];
const brandRetentionFunctionKeys = new Set([
  'private.platform_brand_review_evidence_matches/3',
  'private.guard_platform_brand_retained_asset/0',
  'private.guard_platform_brand_retention_hold/0',
  'private.guard_platform_brand_retention_profile/0',
  'private.guard_platform_brand_retention_references/0',
  'private.guard_platform_brand_storage_incarnation/0',
  'private.media_scan_brand_binding/1',
  'private.media_scan_byte_immutable/0',
  'private.media_scan_byte_result_binding/1',
  'private.platform_brand_claimed_scan_evidence_matches/5',
  'private.platform_brand_retention_immutable/0',
  'private.platform_brand_retention_lock/0',
  'private.platform_brand_retention_references_clear/1',
  'private.platform_brand_scan_byte_receipt_matches/4',
  'public.begin_media_scan_byte_observation/3',
  'public.begin_platform_brand_retention_transport/1',
  'public.claim_platform_brand_retention_expiry/1',
  'public.finish_platform_brand_retention_expiry/2',
  'public.read_platform_brand_retention_binding/1',
  'public.read_platform_brand_retention_expiry_claim/2',
  'public.record_media_scan_byte_receipt/5',
  'public.record_platform_brand_retention_proof/3',
  'public.record_platform_brand_retention_transport_result/3',
  'public.remove_platform_brand_asset/1',
]);

const inspectionBundleFiles = [
  '20261020124645_owner_content_inspection_disabled.sql',
  '20261020124904_content_inspection_verified_media.sql',
  '20261020124927_content_inspection_subject_browse.sql',
  '20261020141458_deleted_content_retention.sql',
  '20261020141529_content_inspection_deleted_fallback.sql',
  '20261020141554_deleted_media_reference_retirement.sql',
  '20261020141633_deleted_content_media_expiry.sql',
  '20261020141653_content_inspection_retained_originals.sql',
];
const inspectionFunctionKeys = new Set([
  'private.capture_deleted_content_row/3',
  'private.capture_deleted_content_trigger/0',
  'private.claim_deleted_media_retirement/1',
  'private.content_inspection_actor/3',
  'private.content_inspection_audit/11',
  'private.content_inspection_context_owned/2',
  'private.content_inspection_current_source/2',
  'private.content_inspection_grant_valid/1',
  'private.content_inspection_immutable_event/0',
  'private.content_inspection_live_media_binding/3',
  'private.content_inspection_media_binding/2',
  'private.content_inspection_media_receipt_valid/1',
  'private.content_inspection_owner_target/2',
  'private.content_inspection_source/2',
  'private.deleted_content_hold_matches/7',
  'private.deleted_content_immutable/0',
  'private.deleted_content_legal_hold_guard/0',
  'private.deleted_media_arm_reference_fence/0',
  'private.deleted_media_has_live_reference/1',
  'private.deleted_media_locator_columns/1',
  'private.deleted_media_locator_document/2',
  'private.deleted_media_mentions/2',
  'private.deleted_media_normalize_locator/1',
  'private.deleted_media_preserve_identity/0',
  'private.deleted_media_preserve_reference_fence/0',
  'private.deleted_media_reference_coverage_ready/0',
  'private.deleted_media_reference_fence_armed/0',
  'private.deleted_media_reference_identity/1',
  'private.deleted_media_retirement_binding/1',
  'private.finalize_deleted_media_inspection_proof/2',
  'private.guard_deleted_media_references/0',
  'private.read_deleted_content_inspection/2',
  'private.register_deleted_media_retirement/0',
  'public.admin_authorize_content_inspection_media/3',
  'public.admin_close_content_inspection_context/3',
  'public.admin_create_content_inspection_context/3',
  'public.admin_grant_content_inspection_access/7',
  'public.admin_list_content_inspection_contexts/4',
  'public.admin_list_content_inspection_scope/3',
  'public.admin_list_content_inspection_subject_targets/6',
  'public.admin_prepare_content_inspection_media/5',
  'public.admin_read_content_inspection/5',
  'public.admin_resolve_content_inspection_media/3',
  'public.admin_revoke_content_inspection_access/3',
  'public.check_deleted_media_retirement/4',
  'public.claim_deleted_content_media_expiry/1',
  'public.deleted_content_expiry_readiness/0',
  'public.expire_deleted_content_text/1',
  'public.list_deleted_content_expiry_work/0',
  'public.list_deleted_content_media_expiry_work/0',
  'public.read_deleted_content_media_expiry_claim/1',
  'public.reconcile_deleted_content_stage/1',
  'public.record_deleted_content_media_expiry_result/2',
  'public.stage_deleted_content_media/6',
]);

const retentionRecoveryFiles = [
  '20261020201310_deleted_content_stage_recovery.sql',
  '20261020201322_deleted_content_activation_readiness.sql',
  '20261020201336_deleted_content_delete_intent.sql',
  '20261020201937_deleted_content_terminal_source_cleanup.sql',
];
const retentionRecoveryFunctionKeys = new Set([
  'private.cleanup_expired_deleted_attachment_source/1',
  'private.deleted_content_original_rendition_alias/2',
  'private.deleted_content_soft_media_coverage/1',
  'private.deleted_content_source_coverage/2',
  'private.expire_deleted_content_text_legacy/1',
  'private.guard_deleted_content_activation/0',
  'private.guard_deleted_content_secondary_coverage/0',
  'private.guard_deleted_content_source_coverage/0',
  'private.preserve_deleted_content_legacy_gate/0',
  'private.preserve_deleted_stage_cleanup_claim/0',
  'private.stage_deleted_content_media_internal/6',
  'public.delete_retained_content/6',
  'public.list_deleted_content_stage_cleanup_work/0',
  'public.read_deleted_content_stage_cleanup_claim/1',
  'public.record_deleted_content_stage_cleanup_result/2',
  'public.record_deleted_content_worker_heartbeat/0',
]);

const adminBackendFiles = [
  '20261020141826_transactional_staff_permission_templates.sql',
  '20261020141850_admin_reports_dmca_complete_history.sql',
];
const adminBackendFunctionKeys = new Set([
  'private.staff_permission_template/1',
  'private.assert_staff_permission_template_authority/3',
  'public.admin_mutate_staff_permission_template/7',
  'public.admin_parse_history_cursor/2',
  'public.list_admin_reports_page/3',
  'public.list_admin_dmca_cases_page/5',
  'public.get_admin_dmca_case_summary/1',
  'public.list_admin_report_audit_events_page/3',
]);

const userIdHoldScopeFiles = ['20261025083249_deleted_content_user_id_hold_scope.sql'];
const brandEmptyFiles = ['20261025114152_platform_brand_empty_test_disposition.sql'];
const brandObservationFiles = ['20261025111212_platform_brand_expiry_observation_recovery.sql'];
const brandReferenceFiles = [
  '20261025121430_platform_brand_reference_scan_performance.sql',
  '20261025141347_platform_brand_reference_candidate_indexes.sql',
];
const legacyRenditionFiles = ['20261025192059_legacy_rendition_playback_authority.sql'];
// Creator/buyer successors have an independently replayed, exact identity map.
// Historical repair scope remains unchanged; only declared additions count.
// Existing scan/playback functions are replaced, not added. Keep only the
// seven new identities in this schema count; the extensions guard is checked
// separately so installing pg_trgm cannot widen the historical catalog scope.
const referenceAndRenditionFunctionIdentities = new Map([
  ['private.platform_brand_retention_row_mentions/4','private.platform_brand_retention_row_mentions(jsonb,text[],text,text)'],
  ['private.platform_brand_index_jsonb_bytes_v1/1','private.platform_brand_index_jsonb_bytes_v1(jsonb)'],
  ['private.platform_brand_index_normalize_v1/1','private.platform_brand_index_normalize_v1(text)'],
  ['private.platform_brand_index_environment_v1/0','private.platform_brand_index_environment_v1()'],
  ['private.platform_brand_index_spec_v1/1','private.platform_brand_index_spec_v1(oid)'],
  ['private.platform_brand_index_expression_v1/1','private.platform_brand_index_expression_v1(oid)'],
  ['public.video_rendition_playback_safe/1','video_rendition_playback_safe(uuid)'],
]);
const brandEmptyFunctionKeys = new Set([
  'private.platform_brand_empty_core_snapshot/3',
  'private.platform_brand_empty_intent_snapshot/1',
  'private.platform_brand_empty_owner_receipt_matches/2',
  'public.remove_platform_brand_empty_test_asset/1',
  'private.platform_brand_empty_snapshot/2',
  'private.platform_brand_empty_history_matches/2',
  'private.platform_brand_empty_evidence_matches/2',
  'private.guard_platform_brand_empty_history/0',
  'private.deleted_content_brand_source_coverage_before_empty/2',
  'private.claim_platform_brand_retention_expiry_before_empty/1',
  'private.read_platform_brand_retention_expiry_claim_before_empty/2',
  'public.begin_platform_brand_empty_observation/1',
  'public.read_platform_brand_empty_observation/2',
  'public.record_platform_brand_empty_disposition/3',
]);
const brandObservationFunctionKeys = new Set(['public.prepare_platform_brand_retention_dispatch/2','public.prepare_platform_brand_retention_batch_dispatch/2']);
const brandGlobalRetentionFiles = ['20261025033057_platform_brand_global_retention_integration.sql'];
const brandArchivedVerificationFiles = ['20261025111122_platform_brand_archived_byte_verification.sql'];
const brandArchivedVerificationFunctionIdentities = new Map([
  ['private.platform_brand_archived_service_required/0','private.platform_brand_archived_service_required()'],
  ['private.platform_brand_archived_snapshot/2','private.platform_brand_archived_snapshot(uuid,boolean)'],
  ['private.platform_brand_archived_read_allowed/1','private.platform_brand_archived_read_allowed(uuid)'],
  ['private.platform_brand_archived_attempt_current/3','private.platform_brand_archived_attempt_current(uuid,uuid,text)'],
  ['private.platform_brand_archived_result_valid/1','private.platform_brand_archived_result_valid(jsonb)'],
  ['private.platform_brand_archived_receipt_matches/5','private.platform_brand_archived_receipt_matches(uuid,jsonb,text,bigint,uuid)'],
  ['private.platform_brand_scan_byte_receipt_matches_before_archived/4','private.platform_brand_scan_byte_receipt_matches_before_archived(uuid,jsonb,text,bigint)'],
  ['private.platform_brand_claimed_scan_evidence_matches_before_archived/5','private.platform_brand_claimed_scan_evidence_matches_before_archived(uuid,uuid,jsonb,text,bigint)'],
  ['public.request_platform_brand_archived_verification/2','request_platform_brand_archived_verification(uuid,jsonb)'],
  ['public.claim_platform_brand_archived_verification/2','claim_platform_brand_archived_verification(uuid[],text)'],
  ['public.read_platform_brand_archived_verification_attempt/3','read_platform_brand_archived_verification_attempt(uuid,uuid,text)'],
  ['public.record_platform_brand_archived_verification_result/4','record_platform_brand_archived_verification_result(uuid,uuid,text,jsonb)'],
  ['public.seal_platform_brand_archived_verification/4','seal_platform_brand_archived_verification(uuid,uuid,text,uuid)'],
]);
const brandGlobalRetentionFunctionKeys = new Set([
  'private.deleted_content_brand_source_coverage/2',
  'private.guard_deleted_content_brand_admission/0',
  'private.deleted_content_brand_guards_ready/0',
  'private.deleted_content_brand_transport_qualified/0',
  'private.capture_deleted_content_row_before_brand/3',
  'private.expire_deleted_content_text_before_brand/1',
  'public.list_platform_brand_retention_expiry_work/0',
  'public.record_platform_brand_retention_worker_heartbeat/2',
  'public.begin_platform_brand_retention_batch_transport/1',
  'public.read_platform_brand_retention_batch_claim/2',
]);
const externalReferenceFiles = ['20261024093048_deleted_content_reviewed_external_reference.sql'];
const externalReferenceFunctionKeys = new Set([
  'private.deleted_content_external_sha256/1',
  'private.preserve_deleted_content_external_reference/0',
  'private.invalidate_deleted_content_external_source/0',
  'private.deleted_content_external_reference_binding/1',
  'private.deleted_content_external_reference_blocker/1',
  'private.read_deleted_content_external_reference_source/1',
  'private.record_deleted_content_external_reference/3',
  'private.guard_deleted_content_external_ownership/0',
  'private.deleted_content_external_guards_ready/0',
  'private.guard_deleted_content_external_archive/0',
  'private.deleted_content_external_archive_supported/1',
  'private.deleted_content_source_coverage_before_external/2',
  'private.capture_deleted_content_row_before_external/3',
  'private.delete_retained_content_before_external/6',
  'private.expire_deleted_content_text_before_external/1',
]);
const originalCopyFiles = ['20261021134033_supabase_original_copy_receipts.sql','20261025111024_supabase_original_copy_cutover.sql'];
const originalCopyFunctionKeys = new Set([
 'private.preserve_supabase_original_copy_receipt/0',
 'private.supabase_original_copy_snapshot_sha256/1',
 'private.read_supabase_original_copy_source/2',
 'private.supabase_original_copy_binding/2',
 'public.record_supabase_original_copy_receipt/8',
 'public.preflight_supabase_original_copy_cutover/1',
 'private.lock_supabase_copy_cutover/0',
 'private.supabase_copy_cutover_source/1',
 'private.supabase_copy_scan_receipt_matches/2',
 'private.supabase_copy_provenance_current/1',
 'private.deleted_media_legacy_source_supported_before_copy_cutover/2',
 'public.has_verified_legacy_media_object_provenance_before_copy_cutover/5',
 'public.has_verified_legacy_video_object_provenance_before_copy_cutover/4',
 'public.read_supabase_original_copy_cutover/1',
 'public.commit_supabase_original_copy_cutover/4',
 'public.begin_supabase_copy_scan_observation/3',
 'public.record_supabase_copy_scan_receipt/5',
 'public.enroll_supabase_copy_retention_provenance/4',
]);

const legacyRetentionFiles = ['20261021134020_deleted_media_legacy_provenance_adapter.sql'];
const legacyRetentionFunctionKeys = new Set([
  'private.preserve_deleted_media_legacy_provenance/0',
  'private.deleted_media_legacy_source_binding/2',
  'private.read_deleted_media_legacy_source/2',
  'private.enroll_deleted_media_legacy_provenance/4',
  'private.validate_deleted_media_legacy_provenance/1',
  'private.deleted_media_legacy_source_supported/2',
  'private.preserve_deleted_media_legacy_delivery_revocation/0',
  'private.deleted_media_legacy_delivery_revoked/3',
  'public.check_legacy_media_delivery_revocation/3',
  'private.revoke_deleted_media_legacy_delivery/1',
]);

const collectionOrderingFiles = ['20261020233652_user_collection_revision_authority.sql'];
const notificationPreferenceOrderingFiles = ['20261022204942_notification_preference_revision_authority.sql'];
const notificationRegistrationOrderingFiles = ['20261022205003_notification_registration_revision_authority.sql'];
const notificationRegistrationFunctionKeys = new Set(['private.assert_push_registration_subject/7','private.push_registration_current/1','public.read_my_push_registration_intent/7','public.register_my_push_token/16']);
const notificationPreferenceFunctionKeys = new Set([
  'private.advance_notification_preference_revision/0',
  'private.assert_notification_preference_session/0',
  'public.read_my_notification_preferences/0',
  'public.mutate_my_notification_preferences/4',
]);
const explicitApiGrantFiles = ['20261021152932_explicit_service_api_grants.sql'];
const realtimeIdentityFiles = ['20261022204956_message_realtime_replica_identity.sql'];
const r2QualificationFiles = ['20261024175231_r2_qualification_test_ledger.sql'];
// Only these two public RPCs enter this catalog's existing schema scope; the
// isolated ledger helpers remain in r2_qualification_test_private, not Studio.
const r2QualificationFunctionIdentities = new Map([
  ['public.read_r2_qualification_test_run/2','read_r2_qualification_test_run(text,text)'],
  ['public.cas_r2_qualification_test_run/4','cas_r2_qualification_test_run(text,text,integer,jsonb)'],
]);
const collectionOrderingFunctionKeys = new Set([
  'private.assert_user_collection_session/0', 'private.user_collection_projection_value/3',
  'public.read_my_collection_state/3', 'public.mutate_my_collection_state/5',
]);
const ownerSecurityFiles = [
  '20261020222318_transactional_owner_security_canary.sql',
  '20261020222325_staff_permission_null_actor_closure.sql',
];
// The transactional repair adds eight private and seven public functions.
// The null-actor closure replaces three existing signatures, adding none.
const ownerSecurityFunctionKeys = new Set([
  'private.preserve_admin_mutation_identity/0',
  'private.guard_admin_canary_authority/0',
  'private.guard_admin_canary_auth_insert/0',
  'private.assert_admin_mutation_actor/1',
  'private.lock_admin_mutation_actor/0',
  'private.assert_owner_security_context/3',
  'private.assert_admin_canary_user/3',
  'private.admin_canary_manifest/1',
  'public.owner_security_revoke_grants/6',
  'public.begin_admin_canary_run/1',
  'public.register_admin_canary_user/3',
  'public.provision_admin_canary_fixture/4',
  'public.read_admin_canary_manifest/1',
  'public.list_admin_canary_pending_runs/0',
  'public.cleanup_admin_canary_run/2',
]);

const studioBundleFiles = [
  '20261015073423_platform_studio_publication_and_audience_authority.sql',
  '20261019020049_platform_studio_rolling_brand_compatibility.sql',
  '20261019020052_platform_studio_rolling_audience_compatibility.sql',
];
// The held migration adds eight functions; Brand adds five (including the
// retained asset-publish implementation's new identity), and Audience four.
const studioFunctionKeys = new Set([
  'guard_platform_brand_profile_publication_metadata/0',
  'platform_brand_publication_asset_safe_internal/2',
  'platform_studio_current_staff_access_internal/0',
  'platform_studio_current_creator_tool_access_internal/0',
  'publish_platform_brand_profile/1', 'read_public_platform_identity/1',
  'read_public_channel_follower_count/1', 'review_channel_audience_request/2',
  'platform_brand_publication_metadata_read_allowed/1',
  'record_platform_brand_publication_metadata/0',
  'publish_platform_brand_profile_assets_internal/2',
  'platform_brand_published_object_visible_internal/3',
  'guard_platform_brand_asset_archive_transition/0',
  'assert_channel_audience_review_authority_internal/3',
  'preflight_legacy_channel_audience_follow/2',
  'guard_legacy_channel_audience_follow_insert/0',
  'guard_channel_audience_review_transition/0',
].map(name => `public.${name}`));

const targets=new Set([
  'has_platform_role/1','has_platform_permission/1','is_platform_owner_user/1','has_active_beta_access/0',
  'resolve_sandbox_monetization_tester/2','grant_sandbox_monetization_tester/4',
  'admin_grant_platform_role_by_email/3','admin_grant_platform_role_by_email/4',
  'admin_grant_platform_role_by_email_pre_subject_closeout/3','admin_grant_platform_role_by_email_pre_exact_subject_closure/3',
  'watch_party_room_access_pre_live_decouple/2','resolve_watch_party_livekit_authority_pre_service_fix/3',
  'watch_party_room_self_access_allowed_internal/2','resolve_watch_party_livekit_viewer_authority/3',
  'apply_revenuecat_terminal_quarantine_projection_internal/1',
].map(x=>`public.${x}`));
const schemas="('public','private','cognitive_runtime','profile_engagement_private')";
const queries={
  functions:`select p.oid,n.nspname||'.'||p.proname||'/'||p.pronargs key,p.oid::regprocedure::text identity,
    pg_get_functiondef(p.oid) definition,p.proowner,p.proacl,p.prosecdef,p.proleakproof,p.provolatile,p.proparallel,
    p.proconfig,p.proargtypes::text,p.proallargtypes::text,p.proargmodes::text,p.proargnames::text,
    p.prorettype,pg_get_expr(p.proargdefaults,0) defaults
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ${schemas} and p.prokind='f' order by p.oid`,
  relations:`select n.nspname,c.relname,c.relkind,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,c.relreplident,c.reloptions
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${schemas} order by 1,2`,
  columns:`select n.nspname,c.relname,a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,a.attacl,
    pg_get_expr(d.adbin,d.adrelid) default_expression from pg_attribute a join pg_class c on c.oid=a.attrelid
    join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
    where n.nspname in ${schemas} and a.attnum>0 and not a.attisdropped order by 1,2,3`,
  constraints:`select n.nspname,c.conname,c.conrelid,c.contype,c.convalidated,c.condeferrable,c.condeferred,pg_get_constraintdef(c.oid,true) definition
    from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname in ${schemas} order by 1,2,c.oid`,
  indexes:`select n.nspname,c.relname,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid) definition from pg_index i
    join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${schemas} order by 1,2`,
  triggers:`select n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) definition from pg_trigger t
    join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${schemas} and not t.tgisinternal order by 1,2,3`,
  enums:`select n.nspname,t.typname,e.enumlabel,e.enumsortorder from pg_type t join pg_namespace n on n.oid=t.typnamespace
    join pg_enum e on e.enumtypid=t.oid where n.nspname in ${schemas} order by 1,2,4`,
  sequences:`select * from pg_sequences where schemaname in ${schemas} order by schemaname,sequencename`,
  publications:'select pubname,schemaname,tablename,attnames,rowfilter from pg_publication_tables order by 1,2,3',
  brandIndexGuard:`select p.oid,n.nspname||'.'||p.proname||'/'||p.pronargs key,
    pg_get_functiondef(p.oid) definition,p.proowner,p.proacl,p.prosecdef,p.proconfig,p.prorettype
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='extensions' and p.proname='guard_platform_brand_index_helper_ddl_v1'`,
  brandIndexEventTriggers:`select evtname,evtevent,evtowner,evtfoid,evtenabled,evttags
    from pg_event_trigger where evtname in ('platform_brand_index_helper_ddl_v1','platform_brand_index_helper_drop_v1')
    order by evtname`,
  policies:`select * from pg_policies where schemaname in ${schemas} order by schemaname,tablename,policyname`,
};
async function snapshot(db){return Object.fromEntries(await Promise.all(Object.entries(queries).map(async([key,sql])=>[key,(await db.query(sql)).rows])))}

test('creator monetization has the exact declared catalog delta from the audit checkpoint', {timeout:180_000}, async()=>{
  const excluded=[...monetizationImplementationFiles,...merchStorefrontFiles,...flexibleCommerceFiles];
  const {db,replayReport}=await createDatabase({includeHeldStudio:true,excludeMigrations:excluded});
  try {
    assert.deepEqual(replayReport.excludedMigrations,excluded);
    assert.deepEqual(replayReport.files.filter(file=>merchStorefrontFiles.includes(file)),[], 'dependent storefront belongs after this historical audit checkpoint');
    assert.deepEqual(replayReport.files.filter(file=>monetizationImplementationFiles.includes(file)),[]);
    const before=(await db.query(queries.functions)).rows;
    for(const file of monetizationImplementationFiles){
      const sql=fs.readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8');
      for(const statement of splitSQL(sql)){
        const clean=statement.replace(/--[^\n]*/gu,'').trim();
        if(!clean||/^(?:begin|commit|rollback)\s*;?$/iu.test(clean))continue;
        await db.exec(statement);
      }
    }
    const after=(await db.query(queries.functions)).rows;
    const previous=new Map(before.map(fn=>[fn.identity,fn]));
    const current=new Map(after.map(fn=>[fn.identity,fn]));
    const identities=rows=>rows.map(fn=>[fn.key,fn.identity]).sort();
    assert.deepEqual(identities(after.filter(fn=>!previous.has(fn.identity))),
      [...monetizationAddedFunctionIdentities].sort(),'only the exact new signatures are added');
    assert.deepEqual(identities(before.filter(fn=>!current.has(fn.identity))),
      monetizationRemovedFunctionIdentities,'no historical signature disappears');
    assert.deepEqual(identities(after.filter(fn=>previous.has(fn.identity)
      &&fn.definition!==previous.get(fn.identity).definition)),
    [...monetizationReplacedFunctionIdentities].sort(),'only the exact existing signatures change');
    assert.deepEqual(after.flatMap(fn=>{
      const old=before.find(candidate=>candidate.oid===fn.oid);
      return old&&old.identity!==fn.identity?[[old.identity,fn.identity]]:[];
    }).sort(),[...monetizationRenamedFunctionIdentities].sort(),'renamed predecessors retain their original OIDs');
  } finally {await db.close();}
});


test('physical merch successors have the exact declared catalog delta', {timeout:180_000}, async()=>{
  const excluded=[...merchStorefrontFiles,...flexibleCommerceFiles];
  const {db,replayReport}=await createDatabase({includeHeldStudio:true,excludeMigrations:excluded});
  try {
    assert.deepEqual(replayReport.excludedMigrations,excluded);
    assert.deepEqual(replayReport.files.filter(file=>merchStorefrontFiles.includes(file)),[]);
    // The prerequisite settlement implementation is present in this checkpoint.
    assert.ok(replayReport.files.includes('20261027034844_creator_merch_payment_refund_reconciliation.sql'));
    const before=(await db.query(queries.functions)).rows;
    for(const file of merchStorefrontFiles){
      const sql=fs.readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8');
      for(const statement of splitSQL(sql)){
        const clean=statement.replace(/--[^\n]*/gu,'').trim();
        if(!clean||/^(?:begin|commit|rollback)\s*;?$/iu.test(clean))continue;
        await db.exec(statement);
      }
    }
    const after=(await db.query(queries.functions)).rows;
    const previous=new Map(before.map(fn=>[fn.identity,fn]));
    const current=new Map(after.map(fn=>[fn.identity,fn]));
    const identities=rows=>rows.map(fn=>[fn.key,fn.identity]).sort();
    assert.deepEqual(identities(after.filter(fn=>!previous.has(fn.identity))),[...merchAddedFunctionIdentities].sort(),'only exact new merch signatures are added');
    assert.deepEqual(identities(before.filter(fn=>!current.has(fn.identity))),[],'no historical signature disappears');
    assert.deepEqual(identities(after.filter(fn=>previous.has(fn.identity)&&fn.definition!==previous.get(fn.identity).definition)),[...merchReplacedFunctionIdentities].sort(),'only retained payment entrypoint is wrapped');
    assert.deepEqual(after.flatMap(fn=>{
      const old=before.find(candidate=>candidate.oid===fn.oid);
      return old&&old.identity!==fn.identity?[[old.identity,fn.identity]]:[];
    }).sort(),merchRenamedFunctionIdentities,'original settlement implementation retains its OID');
  } finally {await db.close();}
});

for(const includeHeldStudio of [false,true])test(`runtime catalog scope and idempotence, Studio ${includeHeldStudio?'included':'held'}`,{timeout:120_000},async()=>{
  const {db,repairSql,replayReport}=await createDatabase({overlayLiveDrift:!includeHeldStudio,includeHeldStudio});
  try{
    const before=await snapshot(db);await db.exec(repairSql);const after=await snapshot(db);
    assert.equal(before.functions.length,(includeHeldStudio?1122:1105)+inspectionFunctionKeys.size+adminBackendFunctionKeys.size+retentionRecoveryFunctionKeys.size+ownerSecurityFunctionKeys.size+collectionOrderingFunctionKeys.size+notificationPreferenceFunctionKeys.size+notificationRegistrationFunctionKeys.size+brandRetentionFunctionKeys.size+legacyRetentionFunctionKeys.size+originalCopyFunctionKeys.size+externalReferenceFunctionKeys.size+r2QualificationFunctionIdentities.size+brandGlobalRetentionFunctionKeys.size+brandObservationFunctionKeys.size+brandEmptyFunctionKeys.size+brandArchivedVerificationFunctionIdentities.size+referenceAndRenditionFunctionIdentities.size+monetizationAddedFunctionIdentities.size+profileFeedFunctions.length+discoveryInvalidationFunctions.length+merchAddedFunctionIdentities.size+flexibleCommerceAddedFunctionIdentities.size);
    for(const [label,identities] of [['added',monetizationAddedFunctionIdentities],['replaced',monetizationReplacedFunctionIdentities]]){
      assert.deepEqual(before.functions.filter(fn=>identities.has(fn.key)).map(fn=>[fn.key,fn.identity]).sort(),
        [...identities].sort(),`exact creator monetization ${label} signatures are present`);
    }
    assert.deepEqual(before.functions.filter(fn=>flexibleCommerceAddedFunctionIdentities.has(fn.key)).map(fn=>[fn.key,fn.identity]).sort(),
      [...flexibleCommerceAddedFunctionIdentities].sort(),'exact flexible commerce added signatures are present');
    await assertProfileFeedInventory(db,before.functions);
    assert.deepEqual(before.functions.filter(fn=>merchAddedFunctionIdentities.has(fn.key)).map(fn=>[fn.key,fn.identity]).sort(),
      [...merchAddedFunctionIdentities].sort(),'exact physical storefront/SKU/photo signatures are present');
    await assertDiscoveryInvalidationInventory(db,before.functions);
    assert.deepEqual(before.functions.filter(fn=>referenceAndRenditionFunctionIdentities.has(fn.key)).map(fn=>[fn.key,fn.identity]).sort(),
      [...referenceAndRenditionFunctionIdentities].sort(),'exact Brand reference and legacy rendition helper signatures are present');
    assert.deepEqual(before.brandIndexGuard.map(fn=>fn.key), ['extensions.guard_platform_brand_index_helper_ddl_v1/0']);
    assert.deepEqual(before.brandIndexEventTriggers.map(trigger=>[trigger.evtname,trigger.evtevent,trigger.evtfoid,trigger.evtenabled]), [
      ['platform_brand_index_helper_ddl_v1','ddl_command_end',before.brandIndexGuard[0].oid,'O'],
      ['platform_brand_index_helper_drop_v1','sql_drop',before.brandIndexGuard[0].oid,'O'],
    ],'both immutable helper guards are attached and enabled');
    assert.deepEqual(before.functions.filter(fn=>r2QualificationFunctionIdentities.has(fn.key)).map(fn=>[fn.key,fn.identity]).sort(),
      [...r2QualificationFunctionIdentities].sort(),'exact isolated R2 qualification public RPC keys and signatures are present');
    assert.deepEqual(before.functions.filter(fn=>brandObservationFunctionKeys.has(fn.key)).map(fn=>fn.key).sort(), [...brandObservationFunctionKeys].sort());
    assert.deepEqual(before.functions.filter(fn=>brandEmptyFunctionKeys.has(fn.key)).map(fn=>fn.key).sort(), [...brandEmptyFunctionKeys].sort());
    assert.deepEqual(before.functions.filter(fn=>brandGlobalRetentionFunctionKeys.has(fn.key)).map(fn=>fn.key).sort(), [...brandGlobalRetentionFunctionKeys].sort());
    assert.deepEqual(before.functions.filter(fn=>brandArchivedVerificationFunctionIdentities.has(fn.key)).map(fn=>[fn.key,fn.identity]).sort(),
      [...brandArchivedVerificationFunctionIdentities].sort(),'exact archived Brand verifier function keys and signatures are present');
    assert.deepEqual(before.functions.filter(fn=>externalReferenceFunctionKeys.has(fn.key)).map(fn=>fn.key).sort(), [...externalReferenceFunctionKeys].sort());
    assert.deepEqual(before.functions.filter(fn=>notificationPreferenceFunctionKeys.has(fn.key)).map(fn=>fn.key).sort(), [...notificationPreferenceFunctionKeys].sort());
    assert.deepEqual(before.functions.filter(fn=>notificationRegistrationFunctionKeys.has(fn.key)).map(fn=>fn.key).sort(), [...notificationRegistrationFunctionKeys].sort());
    assert.deepEqual(before.functions.filter(fn=>brandRetentionFunctionKeys.has(fn.key)).map(fn=>fn.key).sort(), [...brandRetentionFunctionKeys].sort());
    assert.deepEqual(before.functions.filter(fn=>originalCopyFunctionKeys.has(fn.key)).map(fn=>fn.key).sort(), [...originalCopyFunctionKeys].sort());
    assert.deepEqual(before.functions.filter(fn=>legacyRetentionFunctionKeys.has(fn.key)).map(fn=>fn.key).sort(), [...legacyRetentionFunctionKeys].sort());
    assert.deepEqual(before.functions.filter(fn=>collectionOrderingFunctionKeys.has(fn.key)).map(fn=>fn.key).sort(), [...collectionOrderingFunctionKeys].sort());
    assert.deepEqual(before.functions.filter(fn=>ownerSecurityFunctionKeys.has(fn.key)).map(fn=>fn.key).sort(),
      [...ownerSecurityFunctionKeys].sort(),'exact Owner Security successor function inventory is present');
    assert.deepEqual(before.functions.filter(fn=>retentionRecoveryFunctionKeys.has(fn.key)).map(fn=>fn.key).sort(),
      [...retentionRecoveryFunctionKeys].sort(),'exact retention recovery successor function inventory is present');
    assert.deepEqual(before.functions.filter(fn=>adminBackendFunctionKeys.has(fn.key)).map(fn=>fn.key).sort(),
      [...adminBackendFunctionKeys].sort(),'exact admin backend successor function inventory is present');
    assert.deepEqual(before.functions.filter(fn=>inspectionFunctionKeys.has(fn.key)).map(fn=>fn.key).sort(),
      [...inspectionFunctionKeys].sort(),'exact disabled inspection/retention function inventory is present');
    assert.deepEqual(before.functions.filter(fn=>studioFunctionKeys.has(fn.key)).map(fn=>fn.key).sort(),
      includeHeldStudio?[...studioFunctionKeys].sort():[], 'the entire Studio bundle has the expected catalog scope');
    assert.deepEqual(after.functions.map(x=>[x.oid,x.identity]),before.functions.map(x=>[x.oid,x.identity]),'stable function OIDs and signatures');
    const changed=after.functions.filter((f,i)=>f.definition!==before.functions[i].definition).map(f=>f.key).sort();
    const expected=[...targets].filter(x=>!includeHeldStudio||x!=='public.is_platform_owner_user/1').sort();
    assert.deepEqual(changed,expected,'only exact declared function targets change');
    for(let i=0;i<after.functions.length;i++){
      const {definition:oldDefinition,proacl:oldAcl,proconfig:oldConfig,...oldAbi}=before.functions[i];
      const {definition:newDefinition,proacl:newAcl,proconfig:newConfig,...newAbi}=after.functions[i];
      assert.deepEqual(newAbi,oldAbi,'ABI/owner/security flags unchanged');
      if(!['public.has_active_beta_access/0','public.resolve_sandbox_monetization_tester/2'].includes(newAbi.key))assert.deepEqual(newAcl,oldAcl,'unrelated EXECUTE ACL unchanged');
      if(newAbi.key!=='public.admin_grant_platform_role_by_email_pre_exact_subject_closure/3')assert.deepEqual(newConfig,oldConfig,'unrelated function settings unchanged');
      if(!targets.has(newAbi.key))assert.equal(newDefinition,oldDefinition,'unrelated body unchanged');
    }
    for(const key of Object.keys(queries).filter(x=>!['functions','policies'].includes(x)))assert.deepEqual(after[key],before[key],`${key} unchanged`);
    const allowedPolicyNames=new Set(['platform_role_memberships_select_own','platform_staff_permission_grants_select_owner_or_self','watch_party_room_memberships_self_insert_policy','watch_party_room_memberships_self_update_policy']);
    assert.deepEqual(after.policies.filter(p=>!allowedPolicyNames.has(p.policyname)),before.policies.filter(p=>!allowedPolicyNames.has(p.policyname)),'unrelated policies unchanged');
    assert.deepEqual(replayReport.skipped,[
      {file:'20260718114500_enable_chat_call_transition_retry_scheduler.sql',index:0,reason:'Managed scheduling/network extension replaced by local doubles'},
      {file:'20260718114500_enable_chat_call_transition_retry_scheduler.sql',index:1,reason:'Managed scheduling/network extension replaced by local doubles'},
      {file:'20260718211432_harden_media_scan_retry_recovery.sql',index:6,reason:'Data-only recovery call, irrelevant to empty isolated schema'},
      {file:'20260718214102_decouple_media_scan_audit_completion.sql',index:10,reason:'Data-only recovery call, irrelevant to empty isolated schema'},
    ],'only exact documented infrastructure/data skips');
    // Preserve the historical baseline, then account for every reviewed successor.
    assert.equal(replayReport.files.length,(includeHeldStudio?429:426)+inspectionBundleFiles.length+adminBackendFiles.length+retentionRecoveryFiles.length+ownerSecurityFiles.length+collectionOrderingFiles.length+notificationPreferenceOrderingFiles.length+notificationRegistrationOrderingFiles.length+explicitApiGrantFiles.length+brandRetentionFiles.length+legacyRetentionFiles.length+originalCopyFiles.length+realtimeIdentityFiles.length+externalReferenceFiles.length+r2QualificationFiles.length+brandGlobalRetentionFiles.length+brandObservationFiles.length+brandEmptyFiles.length+brandArchivedVerificationFiles.length+userIdHoldScopeFiles.length+brandReferenceFiles.length+legacyRenditionFiles.length+monetizationAuditFiles.length+profileFeedFiles.length+discoveryInvalidationFiles.length+merchStorefrontFiles.length+flexibleCommerceFiles.length);
    assert.deepEqual(replayReport.files.filter(file=>flexibleCommerceFiles.includes(file)),flexibleCommerceFiles, 'exact flexible commerce successor migrations replay');
    assert.deepEqual(replayReport.files.filter(file=>merchStorefrontFiles.includes(file)),merchStorefrontFiles, 'exact physical storefront/SKU/photo successors replay');
    assert.deepEqual(replayReport.files.filter(file=>monetizationAuditFiles.includes(file)),monetizationAuditFiles,
      'exact creator/buyer monetization audit migrations replay in both Studio scenarios');
    assert.deepEqual(replayReport.files.filter(file=>profileFeedFiles.includes(file)),profileFeedFiles, 'exact profile feed migration bundle');
    assert.deepEqual(replayReport.files.filter(file=>discoveryInvalidationFiles.includes(file)),discoveryInvalidationFiles, 'exact scoped discovery migration bundle');
    assert.deepEqual(replayReport.files.filter(file=>brandReferenceFiles.includes(file)),brandReferenceFiles);
    assert.deepEqual(replayReport.files.filter(file=>legacyRenditionFiles.includes(file)),legacyRenditionFiles);
    assert.deepEqual(replayReport.files.filter(file=>r2QualificationFiles.includes(file)),r2QualificationFiles,
      'exact isolated R2 qualification migration is replayed in both Studio scenarios');
    assert.deepEqual(replayReport.files.filter(file=>brandObservationFiles.includes(file)),brandObservationFiles);
    assert.deepEqual(replayReport.files.filter(file=>brandEmptyFiles.includes(file)),brandEmptyFiles);
    assert.deepEqual(replayReport.files.filter(file=>brandGlobalRetentionFiles.includes(file)),brandGlobalRetentionFiles);
    assert.deepEqual(replayReport.files.filter(file=>brandArchivedVerificationFiles.includes(file)),brandArchivedVerificationFiles);
    assert.deepEqual(replayReport.files.filter(file=>userIdHoldScopeFiles.includes(file)),userIdHoldScopeFiles);
    assert.deepEqual(replayReport.files.filter(file=>externalReferenceFiles.includes(file)),externalReferenceFiles);
    assert.deepEqual(replayReport.files.filter(file=>realtimeIdentityFiles.includes(file)),realtimeIdentityFiles);
    assert.deepEqual(replayReport.files.filter(file=>originalCopyFiles.includes(file)),originalCopyFiles);
    assert.deepEqual(replayReport.files.filter(file=>legacyRetentionFiles.includes(file)),legacyRetentionFiles);
    assert.deepEqual(replayReport.files.filter(file=>explicitApiGrantFiles.includes(file)),explicitApiGrantFiles);
    assert.deepEqual(replayReport.files.filter(file=>brandRetentionFiles.includes(file)),brandRetentionFiles);
    assert.deepEqual(replayReport.files.filter(file=>collectionOrderingFiles.includes(file)),collectionOrderingFiles);
    assert.deepEqual(replayReport.files.filter(file=>notificationPreferenceOrderingFiles.includes(file)),notificationPreferenceOrderingFiles);
    assert.deepEqual(replayReport.files.filter(file=>notificationRegistrationOrderingFiles.includes(file)),notificationRegistrationOrderingFiles);
    assert.deepEqual(replayReport.files.filter(file=>ownerSecurityFiles.includes(file)),ownerSecurityFiles,
      'entire Owner Security and null-actor successor bundle is replayed');
    assert.deepEqual(replayReport.files.filter(file=>retentionRecoveryFiles.includes(file)),retentionRecoveryFiles,
      'entire retention recovery successor bundle is replayed');
    assert.deepEqual(replayReport.files.filter(file=>adminBackendFiles.includes(file)),adminBackendFiles,
      'entire admin backend successor bundle is replayed');
    assert.deepEqual(replayReport.files.filter(file=>inspectionBundleFiles.includes(file)),inspectionBundleFiles,
      'entire disabled inspection/retention successor bundle is replayed');
    assert.ok(replayReport.files.includes('20261019000210_circle_request_rpc_anon_execute_closure.sql'));
    assert.deepEqual(replayReport.files.filter(file=>studioBundleFiles.includes(file)),
      includeHeldStudio?studioBundleFiles:[], 'Studio migrations are replayed as one complete bundle or omitted together');
    await db.exec(repairSql);assert.deepEqual(await snapshot(db),after,'repeat application is catalog-idempotent');
  }finally{await db.close()}
});
