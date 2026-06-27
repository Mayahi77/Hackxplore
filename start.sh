#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== TwoStroke AI — Start ==="

# Backend
cd "$ROOT/backend"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "[!] Created backend/.env — add your GOOGLE_API_KEY before continuing."
  exit 1
fi

if [ ! -d .venv ]; then
  echo "[*] Creating Python venv..."
  python3 -m venv .venv
fi

source .venv/bin/activate
echo "[*] Installing backend dependencies..."
pip install -q -r requirements.txt

mkdir -p data/chroma

echo "[*] Starting backend on http://localhost:8000 ..."
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Frontend
cd "$ROOT/frontend"
echo "[*] Starting frontend on http://localhost:5173 ..."
npm run dev &
FRONTEND_PID=$!

echo ""
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo "  API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" INT TERM
wait
