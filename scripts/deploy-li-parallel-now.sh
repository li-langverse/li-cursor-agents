#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WS="$(cd "$ROOT/.." && pwd)"
for f in "$WS/.env.github" "$ROOT/.env" "$WS/.env"; do
  if [[ -f "$f" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      line="${line//$'\r'/}"
      line="${line#"${line%%[![:space:]]*}"}"
      [[ "$line" =~ ^# ]] && continue
      [[ "$line" == *=* ]] || continue
      key="${line%%=*}"
      key="${key#"${key%%[![:space:]]*}"}"
      key="${key%"${key##*[![:space:]]}"}"
      key="${key//$'\ufeff'/}"
      val="${line#*=}"
      val="${val#"${val%%[![:space:]]*}"}"
      val="${val%"${val##*[![:space:]]}"}"
      val="${val%$'\r'}"
      case "$key" in
        GH_TOKEN|GITHUB_TOKEN|CURSOR_API_KEY|CURSOR_SDK_KEY) export "$key=$val" ;;
      esac
    done < "$f"
    break
  fi
done
export KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config-homelab}"
if [[ ! -f "$KUBECONFIG" && -f "/mnt/c/Users/Julian/.kube/config-homelab" ]]; then
  export KUBECONFIG="/mnt/c/Users/Julian/.kube/config-homelab"
fi
export GH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [[ -z "$GH_TOKEN" ]]; then
  echo "ERROR: GH_TOKEN required" >&2
  exit 1
fi
exec bash "$ROOT/scripts/setup-engine-k8s-li-parallel.sh"
