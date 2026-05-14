#!/usr/bin/env bash
set -euo pipefail

have() {
  command -v "$1" >/dev/null 2>&1
}

print_section() {
  printf '\n== %s ==\n' "$1"
}

print_section "TURN egress snapshot"
printf 'timestamp_utc=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
printf 'hostname=%s\n' "$(hostname 2>/dev/null || printf 'unknown')"
printf 'mode=read_only\n'

print_section "Network interface byte totals"
if [[ -r /proc/net/dev ]]; then
  awk '
    NR > 2 {
      iface=$1
      gsub(":", "", iface)
      rx=$2
      tx=$10
      printf "%s rx_bytes=%s tx_bytes=%s\n", iface, rx, tx
    }
  ' /proc/net/dev
elif have ip; then
  ip -s link 2>/dev/null | awk '
    /^[0-9]+:/ {
      iface=$2
      gsub(":", "", iface)
    }
    /RX:/ {
      getline
      rx=$1
    }
    /TX:/ {
      getline
      tx=$1
      if (iface != "") printf "%s rx_bytes=%s tx_bytes=%s\n", iface, rx, tx
    }
  '
elif have netstat; then
  netstat -ibn 2>/dev/null | awk '
    NR > 1 && $1 != "Name" && $3 ~ /^<Link#/ && !seen[$1]++ {
      if (NF == 10) {
        printf "%s rx_bytes=%s tx_bytes=%s\n", $1, $6, $9
      } else {
        printf "%s rx_bytes=%s tx_bytes=%s\n", $1, $7, $10
      }
    }
  '
elif have ifconfig; then
  printf 'ifconfig is available, but no portable byte-total parser is configured here. Try: ip -s link or netstat -ibn.\n'
else
  printf 'No read-only interface counter tool found. Try: ip -s link, netstat -ib, or ifconfig.\n'
fi

print_section "Active UDP listener summary"
if have ss; then
  ss -H -ulpn 2>/dev/null | grep -Ei 'turn|coturn|:3478|:5349|:4915[2-9]|:49[2-9][0-9][0-9]|:5[0-9]{4}|:6[0-4][0-9]{3}|:65[0-4][0-9]{2}|:655[0-2][0-9]|:6553[0-5]' || true
elif have lsof; then
  lsof -nP -iUDP 2>/dev/null | grep -Ei 'turn|coturn|3478|5349' || true
elif have netstat; then
  netstat -anu 2>/dev/null | grep -Ei '3478|5349' || true
else
  printf 'No UDP listener tool found. Try: ss -ulpn or lsof -iUDP.\n'
fi

print_section "Active TCP listener summary"
if have ss; then
  ss -H -tlpn 2>/dev/null | grep -Ei 'turn|coturn|:3478|:5349' || true
elif have lsof; then
  lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -Ei 'turn|coturn|3478|5349' || true
elif have netstat; then
  netstat -ant 2>/dev/null | grep -Ei 'LISTEN|3478|5349' || true
else
  printf 'No TCP listener tool found. Try: ss -tlpn or lsof -iTCP -sTCP:LISTEN.\n'
fi

print_section "coturn and log hints"
if have systemctl; then
  systemctl list-units --type=service --all 2>/dev/null | grep -Ei 'coturn|turnserver' || true
else
  printf 'systemctl not available; service status not checked.\n'
fi

for path in /var/log/turnserver /var/log/coturn /var/log/syslog /var/log/messages; do
  if [[ -e "$path" ]]; then
    printf 'log_hint=%s\n' "$path"
  fi
done

printf '\nRead-only snapshot complete. No firewall, service, config, or network state changes were made.\n'
