#!/bin/sh
# Removes the Aeon Spiral login agent and stops the server.
LABEL="com.aeonspiral.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$PLIST"
echo "Aeon Spiral server removed."
