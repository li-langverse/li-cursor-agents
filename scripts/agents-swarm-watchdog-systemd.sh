#!/usr/bin/env bash
export AGENTS_SWARM_ROLE="watchdog"
exec "$(dirname "$0")/lib/agents-swarm-systemd-wrapper.sh"
