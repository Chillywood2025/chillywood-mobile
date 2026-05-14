#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/infra/turn-burn-rate-estimator.sh <gib_per_hour> <cost_per_gib>

Example:
  scripts/infra/turn-burn-rate-estimator.sh 120 0.01

Notes:
  - Use GiB/hour from current host/provider metrics.
  - Use cost-per-GiB from the current vendor bill or pricing page.
  - This script does not hardcode any provider's pricing as truth.
USAGE
}

is_number() {
  [[ "${1:-}" =~ ^[0-9]+([.][0-9]+)?$ ]]
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 2 ]]; then
  usage >&2
  exit 2
fi

gib_per_hour="$1"
cost_per_gib="$2"

if ! is_number "$gib_per_hour"; then
  printf 'Error: gib_per_hour must be numeric, got: %s\n' "$gib_per_hour" >&2
  exit 2
fi

if ! is_number "$cost_per_gib"; then
  printf 'Error: cost_per_gib must be numeric, got: %s\n' "$cost_per_gib" >&2
  exit 2
fi

awk -v gib="$gib_per_hour" -v cost="$cost_per_gib" '
  BEGIN {
    hourly = gib * cost
    daily = hourly * 24
    weekly = hourly * 24 * 7
    printf "TURN burn estimate\n"
    printf "gib_per_hour=%.4f\n", gib
    printf "cost_per_gib=%.6f\n", cost
    printf "estimated_hourly_cost=%.2f\n", hourly
    printf "estimated_daily_cost=%.2f\n", daily
    printf "estimated_7_day_cost=%.2f\n", weekly
    printf "pricing_source=current vendor bill/pricing page required\n"
  }
'
