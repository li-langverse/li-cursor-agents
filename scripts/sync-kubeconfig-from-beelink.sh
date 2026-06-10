#!/usr/bin/env bash
# Symlink ~/.kube/config-homelab -> beelink-cleanup/.kube/config-homelab (after optional fetch).
set -euo pipefail

beelink_root="${BEELINK_CLEANUP_ROOT:-/c/Users/Julian/Documents/Programming/beelink-cleanup}"
dest="${KUBECONFIG_DEST:-$HOME/.kube/config-homelab}"
canonical="$beelink_root/.kube/config-homelab"

fetch_ps1="$beelink_root/scripts/fetch-kubeconfig-from-blackpearl.ps1"
if [[ ! -f "$canonical" && -f "$fetch_ps1" ]]; then
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$fetch_ps1" -BeelinkRoot "$beelink_root" 2>/dev/null || true
fi

if [[ -f "$canonical" ]]; then
  mkdir -p "$(dirname "$dest")"
  if [[ -L "$dest" || -f "$dest" ]]; then rm -f "$dest"; fi
  ln -s "$canonical" "$dest"
  echo "sync-kubeconfig: linked $dest -> $canonical"
  export KUBECONFIG="$dest"
elif [[ -f "$dest" ]]; then
  echo "sync-kubeconfig: using existing $dest"
  export KUBECONFIG="$dest"
else
  echo "sync-kubeconfig: WARN missing $canonical (need homelab SSH key + fetch)" >&2
fi
