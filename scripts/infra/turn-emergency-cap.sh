#!/usr/bin/env bash
set -euo pipefail

DRY_RUN="${DRY_RUN:-1}"
CONFIRM_TURN_EMERGENCY="${CONFIRM_TURN_EMERGENCY:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

have() {
  command -v "$1" >/dev/null 2>&1
}

usage() {
  cat <<'USAGE'
Usage:
  scripts/infra/turn-emergency-cap.sh <action>

Actions:
  snapshot        Run the read-only TURN egress snapshot helper.
  cap             Print operator steps for applying a temporary TURN/network cap.
  disable-relay   Print last-resort operator steps for disabling TURN relay traffic.
  restore-notes   Print rollback/restore checklist notes.

Safety:
  - DRY_RUN defaults to 1.
  - cap and disable-relay refuse to proceed unless:
      DRY_RUN=0 CONFIRM_TURN_EMERGENCY=YES
  - This script does not silently apply firewall rules.
  - This script does not embed secrets.
  - This script does not kill unrelated services.
USAGE
}

warn_banner() {
  cat <<'WARN'
WARNING:
  TURN emergency actions can degrade Live Watch-Party and Watch-Party Live
  for users behind strict NAT, carrier networks, enterprise firewalls, or
  other relay-dependent networks.

  Preserve evidence, record an Admin Live Cost Guard event/action, and keep
  secrets/tokens/private logs out of tickets and commits.
WARN
}

require_confirmed_emergency() {
  if [[ "$DRY_RUN" != "0" || "$CONFIRM_TURN_EMERGENCY" != "YES" ]]; then
    warn_banner
    cat <<'REFUSE'

Refusing destructive guidance because this is still dry-run or not confirmed.
Re-run only during an approved incident as:

  DRY_RUN=0 CONFIRM_TURN_EMERGENCY=YES scripts/infra/turn-emergency-cap.sh <cap|disable-relay>

No firewall, service, config, or network state changes were made.
REFUSE
    exit 2
  fi
}

print_detected_tools() {
  printf '\nDetected tools:\n'
  for tool in systemctl turnserver coturn nft iptables ss lsof; do
    if have "$tool"; then
      printf '  %s=available\n' "$tool"
    else
      printf '  %s=missing\n' "$tool"
    fi
  done
}

print_cap_steps() {
  print_detected_tools
  cat <<'STEPS'

Temporary cap operator steps:
  1. Capture a snapshot first:
       scripts/infra/turn-egress-snapshot.sh
  2. Prefer provider/network controls or a narrowly scoped host firewall rule
     that limits TURN relay ranges only. Do not touch LiveKit signaling.
  3. If nft is available, draft an nft rule in an operator shell and review it
     before applying. Keep the exact command in the incident record.
  4. If iptables is available, draft an iptables rule in an operator shell and
     review it before applying. Keep the exact command in the incident record.
  5. Record the cap as Admin Live Cost Guard action:
       turn_bandwidth_cap_requested
  6. Watch TURN egress, LiveKit room health, and support reports.

This script intentionally prints steps only. It did not apply firewall rules.
STEPS

  if have nft; then
    cat <<'NFT'

nft detected. Review current rules before any change:
  sudo nft list ruleset

Manual nft command template, only after confirming TURN ports/ranges:
  sudo nft add table inet chillywood_turn_guard
  sudo nft add chain inet chillywood_turn_guard output '{ type filter hook output priority 0; policy accept; }'
  sudo nft add rule inet chillywood_turn_guard output udp dport { 3478, 5349 } counter limit rate over <calibrated_rate>/second drop

Replace `<calibrated_rate>` with an incident-approved value. Do not paste this blindly.
NFT
  elif have iptables; then
    cat <<'IPTABLES'

iptables detected. Review current rules before any change:
  sudo iptables-save

Manual iptables command template, only after confirming TURN ports/ranges:
  sudo iptables -I OUTPUT -p udp -m multiport --dports 3478,5349 -m limit --limit <calibrated_rate>/second -j ACCEPT
  sudo iptables -A OUTPUT -p udp -m multiport --dports 3478,5349 -j DROP

Replace `<calibrated_rate>` with an incident-approved value. Do not paste this blindly.
IPTABLES
  else
    printf '\nNo nft or iptables detected. Use provider firewall/rate controls or host tooling documented for this server.\n'
  fi
}

print_disable_relay_steps() {
  print_detected_tools
  cat <<'STEPS'

Last-resort relay-disable operator steps:
  1. Confirm CRITICAL severity and unacceptable cost/security risk.
  2. Warn support/operators that strict-NAT/firewalled users may lose live media.
  3. Capture a snapshot:
       scripts/infra/turn-egress-snapshot.sh
  4. Identify the exact TURN service name before any service action:
       systemctl list-units --type=service --all | grep -Ei 'coturn|turnserver'
  5. If a service stop is approved, run it manually and record the service name.
     Do not stop unrelated LiveKit, Redis, database, object-storage, or app services.
  6. Prefer reversible config/firewall changes with a written rollback command.
  7. Record the action and reason in Admin Live Cost Guard.

This script intentionally prints steps only. It did not stop services.
STEPS

  if have systemctl; then
    cat <<'SYSTEMD'

systemctl detected. Identify the exact TURN service before action:
  systemctl list-units --type=service --all | grep -Ei 'coturn|turnserver'

Manual stop template, only after confirming the exact service:
  sudo systemctl stop <exact-coturn-or-turnserver-service>

Manual restore template:
  sudo systemctl start <exact-coturn-or-turnserver-service>
SYSTEMD
  else
    printf '\nsystemctl not detected. Use this host provider/runbook to identify and control the exact TURN service.\n'
  fi
}

print_restore_notes() {
  cat <<'RESTORE'
Restore notes:
  1. Confirm TURN egress is below WARN threshold for one cooldown window.
  2. Remove temporary cap rules manually from the host/provider.
  3. Restart only the exact TURN service that was changed, if any.
  4. Record restore_normal_mode in Admin Live Cost Guard.
  5. Confirm new Live Watch-Party and Watch-Party Live token issuance is normal.
  6. Confirm Live Stage and Player behavior were not changed.
  7. Preserve sanitized audit evidence; do not commit private logs or secrets.
RESTORE
}

action="${1:-}"

case "$action" in
  -h|--help|"")
    usage
    ;;
  snapshot)
    if [[ -x "$SCRIPT_DIR/turn-egress-snapshot.sh" ]]; then
      "$SCRIPT_DIR/turn-egress-snapshot.sh"
    else
      printf 'Snapshot helper is missing or not executable: %s/turn-egress-snapshot.sh\n' "$SCRIPT_DIR" >&2
      exit 1
    fi
    ;;
  cap)
    require_confirmed_emergency
    warn_banner
    print_cap_steps
    ;;
  disable-relay)
    require_confirmed_emergency
    warn_banner
    print_disable_relay_steps
    ;;
  restore-notes)
    print_restore_notes
    ;;
  *)
    printf 'Unknown action: %s\n\n' "$action" >&2
    usage >&2
    exit 2
    ;;
esac
