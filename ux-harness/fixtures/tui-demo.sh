#!/usr/bin/env bash
# Minimal TUI demo for ux-harness (fixture).
printf '\033[2J\033[HLi TUI demo — press h for help, q to quit\n> '
read -r _ || true
printf 'Help: arrow keys navigate (mock)\n> '
read -r _ || true
printf 'Goodbye.\n'
