#!/usr/bin/env bash
# Install GitHub CLI (gh) for org pull, PR, and merge workflows.
set -euo pipefail

if command -v gh >/dev/null 2>&1; then
  echo "gh already installed: $(gh --version | head -1)"
  exit 0
fi

install_user_local() {
  local ver="${GH_VERSION:-2.63.2}"
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch="amd64" ;;
    aarch64 | arm64) arch="arm64" ;;
    *) echo "unsupported arch: $arch" >&2; return 1 ;;
  esac
  local os
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  local dest="${HOME}/.local/bin"
  mkdir -p "$dest"
  local tgz="/tmp/gh_${ver}_${os}_${arch}.tar.gz"
  echo "==> Download gh ${ver} (${os}/${arch}) to ${dest}/gh"
  curl -fsSL "https://github.com/cli/cli/releases/download/v${ver}/gh_${ver}_${os}_${arch}.tar.gz" -o "$tgz"
  tar -xzf "$tgz" -C /tmp
  install -m 755 "/tmp/gh_${ver}_${os}_${arch}/bin/gh" "$dest/gh"
  rm -rf "/tmp/gh_${ver}_${os}_${arch}" "$tgz"
  if [[ ":${PATH}:" != *":${dest}:"* ]]; then
    echo "Add to PATH: export PATH=\"${dest}:\$PATH\""
  fi
  "$dest/gh" --version
}

if [[ "$(uname -s)" == "Linux" ]] && command -v apt-get >/dev/null 2>&1; then
  if [[ "${EUID:-$(id -u)}" -eq 0 ]] || sudo -n true 2>/dev/null; then
    echo "==> apt install gh"
    sudo apt-get update -qq
    sudo apt-get install -y gh
    gh --version
    exit 0
  fi
fi

if [[ "$(uname -s)" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then
  echo "==> brew install gh"
  brew install gh
  gh --version
  exit 0
fi

install_user_local
