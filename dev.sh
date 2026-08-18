#!/usr/bin/env bash
# Runs the Laravel API, Reverb, and Vite dev server together in one terminal.
# Ctrl+C stops all three.
set -e

cd "$(dirname "$0")"

cleanup() {
  echo "Stopping..."
  kill 0
}
trap cleanup EXIT INT TERM

(cd api && php artisan serve) &
(cd api && php artisan reverb:start) &
(cd web && npm run dev) &

wait
