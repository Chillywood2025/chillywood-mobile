create unique index if not exists "provider_usage_daily_scope_metric_unique"
  on public."provider_usage_daily" using btree (
    "provider",
    (coalesce(("provider_account_id")::text, ''::text)),
    "usage_date",
    "resource_type",
    (coalesce("resource_name", ''::text)),
    "metric_key",
    "unit"
  );

create unique index if not exists "provider_billing_snapshots_scope_month_unique"
  on public."provider_billing_snapshots" using btree (
    "provider",
    (coalesce(("provider_account_id")::text, ''::text)),
    "billing_month",
    "currency"
  );

comment on index public."provider_usage_daily_scope_metric_unique" is
  'Prevents duplicate provider usage import rows for the same provider/date/resource/metric/unit scope. Provider rows are usage facts only, not customer billing truth.';

comment on index public."provider_billing_snapshots_scope_month_unique" is
  'Prevents duplicate future provider billing snapshot rows for the same provider/account/month/currency scope. This pass does not import provider bills.';
