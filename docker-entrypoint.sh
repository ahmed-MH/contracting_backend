#!/bin/sh

set -eu

export CI=true

LOCKFILE="/app/pnpm-lock.yaml"
STAMP="/app/node_modules/.install-stamp"

echo "[backend] Checking dependencies..."

if [ ! -f "$LOCKFILE" ]; then
  echo "[backend] Missing pnpm-lock.yaml"
  exit 1
fi

CURRENT_HASH="$(md5sum "$LOCKFILE" | awk '{print $1}')"
STAMP_HASH="$(cat "$STAMP" 2>/dev/null || true)"

if [ ! -d /app/node_modules ] || [ "$CURRENT_HASH" != "$STAMP_HASH" ]; then
  echo "[backend] Installing dependencies..."
  pnpm install --frozen-lockfile --prefer-offline
  printf '%s' "$CURRENT_HASH" > "$STAMP"
  echo "[backend] Dependencies ready."
else
  echo "[backend] Dependencies already in sync."
fi

echo "[backend] Starting: $*"
exec "$@"
