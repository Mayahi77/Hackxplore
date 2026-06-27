#!/usr/bin/env bash
#
# Build the frontend with the CURRENT live ngrok URL baked in and deploy it to
# Netlify production. Auto-detects the tunnel from the local ngrok API, so it
# keeps working across ngrok restarts (free-tier URLs rotate).
#
# Usage:
#   scripts/deploy-frontend.sh                 # auto-detect ngrok URL
#   VITE_API_URL=https://my.api scripts/deploy-frontend.sh   # override explicitly
#
# Runs automatically on `git push` of main via .git/hooks/pre-push.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/frontend"

# 1. Resolve the API origin: explicit override wins, else read the live ngrok tunnel.
API_URL="${VITE_API_URL:-}"
if [ -z "$API_URL" ]; then
  API_URL=$(curl -s --max-time 3 http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(next((t['public_url'] for t in d.get('tunnels',[]) if t['public_url'].startswith('https')), ''))" 2>/dev/null || true)
fi

if [ -z "$API_URL" ]; then
  echo "✗ No API URL. ngrok isn't running (no https tunnel on :4040)." >&2
  echo "  Start it with:  ngrok http 8000   — or set VITE_API_URL=… explicitly." >&2
  exit 1
fi

# Normalize: drop any trailing slash so the app never builds a '//api' path.
API_URL="${API_URL%/}"

echo "→ Building frontend with VITE_API_URL=$API_URL"
VITE_API_URL="$API_URL" npm run build

echo "→ Deploying to Netlify (production)…"
netlify deploy --prod --dir=dist </dev/null

echo "✓ Deployed. Live API base: $API_URL/api"
