#!/bin/sh
# Installs Aeon Spiral as a macOS login agent: a small static web server that starts at login,
# restarts if it ever dies, and serves this folder at http://localhost:8765.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-8765}"
LABEL="com.aeonspiral.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/aeon-spiral.log"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/python3</string><string>-m</string><string>http.server</string>
    <string>$PORT</string><string>--bind</string><string>127.0.0.1</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 1
if curl -sf "http://127.0.0.1:$PORT/index.html" >/dev/null; then
  echo "Aeon Spiral is serving at http://localhost:$PORT (starts at login, restarts automatically)."
else
  echo "Agent installed but nothing answered on port $PORT yet; see $LOG" >&2; exit 1
fi
