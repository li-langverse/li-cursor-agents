#!/usr/bin/env bash
# Deprecated alias — use npm run dev:all
exec "$(cd "$(dirname "$0")" && pwd)/dev-all.sh" "$@"
