-- LiveKit server metrics readback V1.
-- Adds nullable, non-secret resource/readback fields to the existing registry.
-- Missing metrics must remain null; they must not be faked or treated as proof
-- of higher Chi'llywood room/passive-viewer capacity.

alter table public."livekit_servers"
  add column if not exists "memory_used_mb" numeric,
  add column if not exists "memory_total_mb" numeric,
  add column if not exists "disk_usage_percent" numeric,
  add column if not exists "network_rx_bps" numeric,
  add column if not exists "network_tx_bps" numeric,
  add column if not exists "livekit_node_status" text,
  add column if not exists "turn_status" text,
  add column if not exists "metrics_source" text,
  add column if not exists "metrics_collected_at" timestamptz;

alter table public."livekit_server_heartbeats"
  add column if not exists "memory_used_mb" numeric,
  add column if not exists "memory_total_mb" numeric,
  add column if not exists "disk_usage_percent" numeric,
  add column if not exists "network_rx_bps" numeric,
  add column if not exists "network_tx_bps" numeric,
  add column if not exists "livekit_node_status" text,
  add column if not exists "turn_status" text,
  add column if not exists "metrics_source" text,
  add column if not exists "metrics_collected_at" timestamptz;

do $$
begin
  alter table public."livekit_servers"
    add constraint "livekit_servers_resource_metrics_check"
    check (
      ("memory_used_mb" is null or "memory_used_mb" >= 0)
      and ("memory_total_mb" is null or "memory_total_mb" >= 0)
      and (
        "memory_used_mb" is null
        or "memory_total_mb" is null
        or "memory_used_mb" <= "memory_total_mb"
      )
      and ("disk_usage_percent" is null or ("disk_usage_percent" >= 0 and "disk_usage_percent" <= 100))
      and ("network_rx_bps" is null or "network_rx_bps" >= 0)
      and ("network_tx_bps" is null or "network_tx_bps" >= 0)
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public."livekit_servers"
    add constraint "livekit_servers_metrics_status_check"
    check (
      ("livekit_node_status" is null or "livekit_node_status" in ('unknown', 'healthy', 'degraded', 'unavailable', 'offline'))
      and ("turn_status" is null or "turn_status" in ('unknown', 'configured', 'not_configured', 'unavailable', 'proof_pending'))
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public."livekit_server_heartbeats"
    add constraint "livekit_server_heartbeats_resource_metrics_check"
    check (
      ("memory_used_mb" is null or "memory_used_mb" >= 0)
      and ("memory_total_mb" is null or "memory_total_mb" >= 0)
      and (
        "memory_used_mb" is null
        or "memory_total_mb" is null
        or "memory_used_mb" <= "memory_total_mb"
      )
      and ("disk_usage_percent" is null or ("disk_usage_percent" >= 0 and "disk_usage_percent" <= 100))
      and ("network_rx_bps" is null or "network_rx_bps" >= 0)
      and ("network_tx_bps" is null or "network_tx_bps" >= 0)
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public."livekit_server_heartbeats"
    add constraint "livekit_server_heartbeats_metrics_status_check"
    check (
      ("livekit_node_status" is null or "livekit_node_status" in ('unknown', 'healthy', 'degraded', 'unavailable', 'offline'))
      and ("turn_status" is null or "turn_status" in ('unknown', 'configured', 'not_configured', 'unavailable', 'proof_pending'))
    );
exception
  when duplicate_object then null;
end $$;

comment on column public."livekit_servers"."memory_used_mb" is
  'Latest non-secret host memory-used readback in MB. Null means not collected/proved.';
comment on column public."livekit_servers"."memory_total_mb" is
  'Latest non-secret host memory-total readback in MB. Null means not collected/proved.';
comment on column public."livekit_servers"."disk_usage_percent" is
  'Latest non-secret host disk usage percent. Null means not collected/proved.';
comment on column public."livekit_servers"."network_rx_bps" is
  'Latest non-secret host receive-rate readback in bytes per second. Null means not collected/proved.';
comment on column public."livekit_servers"."network_tx_bps" is
  'Latest non-secret host transmit-rate readback in bytes per second. Null means not collected/proved.';
comment on column public."livekit_servers"."livekit_node_status" is
  'Safe operator-provided node health label; never stores credentials or private config.';
comment on column public."livekit_servers"."turn_status" is
  'Safe TURN proof/configuration label only; never stores TURN credentials.';
comment on column public."livekit_servers"."metrics_source" is
  'Safe source label for latest metrics, such as heartbeat-script or operator-monitoring.';
comment on column public."livekit_servers"."metrics_collected_at" is
  'Host/operator metrics collection timestamp. Null means metrics collection is not proved.';

comment on column public."livekit_server_heartbeats"."metrics_source" is
  'Safe source label for this heartbeat metrics snapshot; no secrets or internal URLs.';
comment on column public."livekit_server_heartbeats"."metrics_collected_at" is
  'Host/operator collection time for this heartbeat metrics snapshot.';
