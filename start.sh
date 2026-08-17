#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -d "$ROOT/backend/.venv" ]]; then
  python3 -m venv "$ROOT/backend/.venv"
  "$ROOT/backend/.venv/bin/pip" install -r "$ROOT/backend/requirements.txt"
fi

if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  (cd "$ROOT/frontend" && npm install)
fi

cd "$ROOT/backend"
"$ROOT/backend/.venv/bin/uvicorn" app.main:app --host 127.0.0.1 --port 8000 &
BACK_PID=$!
trap 'kill $BACK_PID' EXIT

cd "$ROOT/frontend"
npm run dev
