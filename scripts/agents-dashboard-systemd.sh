#!/usr/bin/env bash
export AGENTS_SWARM_ROLE="dashboard"
exec "$(dirname "$0")/lib/agents-swarm-systemd-wrapper.sh"
