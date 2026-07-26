-- Cover every foreign-key lookup introduced by the retry and exact
-- RevenueCat transaction-intent linkage tables.

create index if not exists "chat_call_transition_delivery_failures_invite_idx"
  on public."chat_call_transition_delivery_failures" ("call_invite_id");

create index if not exists "revenuecat_consumable_transaction_intents_user_idx"
  on public."revenuecat_consumable_transaction_intents" ("user_id");

create index if not exists "revenuecat_consumable_transaction_intents_product_idx"
  on public."revenuecat_consumable_transaction_intents" ("product_id");

create index if not exists "revenuecat_consumable_transaction_intents_purchase_intent_idx"
  on public."revenuecat_consumable_transaction_intents" ("purchase_intent_id");

create index if not exists "revenuecat_consumable_transaction_intents_provider_event_idx"
  on public."revenuecat_consumable_transaction_intents" ("provider_event_id");
