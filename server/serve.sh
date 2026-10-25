#!/bin/sh
# One-off foreground server (no install): serves this folder at http://localhost:8765 until you press Ctrl-C.
cd "$(dirname "$0")/.." && exec python3 -m http.server "${1:-8765}" --bind 127.0.0.1
