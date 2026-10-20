#!/usr/bin/env bash
set -euo pipefail

# simpleDrive - One-click launch script with Vite & Cloudflare Tunnel
PORT=5173
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Color definitions
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN}   Joystick Driving Simulator - Cloudflare Tunnel   ${NC}"
echo -e "${CYAN}====================================================${NC}"

# Cleanup handler on exit (Ctrl+C)
cleanup() {
  echo -e "\n${YELLOW}Shutting down servers...${NC}"
  if [[ -n "${VITE_PID:-}" ]] && kill -0 "$VITE_PID" 2>/dev/null; then
    kill "$VITE_PID" 2>/dev/null || true
  fi
  if [[ -n "${TUNNEL_PID:-}" ]] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
  rm -f /tmp/cloudflared_simpledrive.log
  echo -e "${GREEN}Servers stopped cleanly.${NC}"
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 1. Start Vite dev server
echo -e "${YELLOW}[1/3] Starting Vite dev server (port ${PORT})...${NC}"
npx vite --host 0.0.0.0 --port "$PORT" > /dev/null 2>&1 &
VITE_PID=$!

# Wait for local server to respond
echo -n "Waiting for Vite to become ready"
for _ in {1..20}; do
  if curl -s "http://127.0.0.1:${PORT}" > /dev/null 2>&1; then
    echo -e " ${GREEN}OK${NC}"
    break
  fi
  echo -n "."
  sleep 0.5
done

# 2. Start Cloudflare Tunnel
echo -e "${YELLOW}[2/3] Establishing Cloudflare Tunnel...${NC}"
TUNNEL_LOG="/tmp/cloudflared_simpledrive.log"
rm -f "$TUNNEL_LOG"

cloudflared tunnel --url "http://127.0.0.1:${PORT}" > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

# Extract public tunnel URL
TUNNEL_URL=""
echo -n "Waiting for Tunnel URL"
for _ in {1..30}; do
  if [[ -f "$TUNNEL_LOG" ]]; then
    TUNNEL_URL=$(grep -oE "https://[a-zA-Z0-9.-]+\.trycloudflare\.com" "$TUNNEL_LOG" | head -n 1 || true)
    if [[ -n "$TUNNEL_URL" ]]; then
      echo -e " ${GREEN}OK${NC}"
      break
    fi
  fi
  echo -n "."
  sleep 1
done

if [[ -z "$TUNNEL_URL" ]]; then
  echo -e "\n${RED}Failed to retrieve Cloudflare Tunnel URL. Check logs:${NC}"
  cat "$TUNNEL_LOG"
  exit 1
fi

# 3. Display Connection Info & QR Code
echo -e "\n${GREEN}====================================================${NC}"
echo -e "${GREEN} Tunnel is ready! Access the simulator at: ${NC}"
echo -e "${CYAN} ${TUNNEL_URL}${NC}"
echo -e "${GREEN}====================================================${NC}\n"

if command -v qrencode >/dev/null 2>&1; then
  echo -e "${YELLOW}Scan this QR code with iPad / Smartphone camera:${NC}\n"
  qrencode -t UTF8 "$TUNNEL_URL"
  echo ""
fi

echo -e "${YELLOW}Press Ctrl+C to stop both Vite server and Cloudflare Tunnel.${NC}"

# Keep script running and wait for background jobs
wait "$TUNNEL_PID" 2>/dev/null || true
