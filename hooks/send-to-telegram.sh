#!/bin/bash

# Claude Code Stop Hook - Sends Claude's response to Bridge
# This script is called by Claude Code when it finishes responding.

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load .env file if exists
ENV_FILE="$SCRIPT_DIR/../.env"
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

# Configuration
BRIDGE_URL="${BRIDGE_URL:-http://localhost:3007/hook}"

# Read hook input from stdin
INPUT=$(cat)

# Parse hook event name
HOOK_EVENT=$(echo "$INPUT" | grep -o '"hook_event_name":"[^"]*"' | cut -d'"' -f4)

# Only process Stop events
if [ "$HOOK_EVENT" != "Stop" ]; then
  exit 0
fi

# Extract transcript path
TRANSCRIPT_PATH=$(echo "$INPUT" | grep -o '"transcript_path":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TRANSCRIPT_PATH" ]; then
  echo "No transcript path in hook input"
  exit 1
fi

# Expand ~ in path
TRANSCRIPT_PATH="${TRANSCRIPT_PATH/#\~/$HOME}"

# Extract cwd
CWD=$(echo "$INPUT" | grep -o '"cwd":"[^"]*"' | cut -d'"' -f4)
CWD="${CWD:-未知目录}"

# Extract session ID from transcript path
SESSION_ID=$(basename "$TRANSCRIPT_PATH" .jsonl)

# Check if transcript file exists
if [ ! -f "$TRANSCRIPT_PATH" ]; then
  echo "Transcript file not found: $TRANSCRIPT_PATH"
  exit 1
fi

# Extract last assistant message from transcript (read from end)
# Look for lines with "type":"assistant" and extract text content
MESSAGE=$(tac "$TRANSCRIPT_PATH" | while read -r line; do
  if echo "$line" | grep -q '"type":"assistant"'; then
    # Extract text content - this is a simplified extraction
    # For complex messages, the Node.js version is more reliable
    TEXT=$(echo "$line" | grep -o '"text":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -n "$TEXT" ]; then
      echo "$TEXT"
      break
    fi
  fi
done)

if [ -z "$MESSAGE" ]; then
  echo "No assistant message found in transcript"
  exit 0
fi

# Send to bridge
RESPONSE=$(curl -s -X POST "$BRIDGE_URL" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"$MESSAGE\",\"cwd\":\"$CWD\",\"sessionId\":\"$SESSION_ID\"}" \
  2>/dev/null)

if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "Message sent to bridge successfully"
elif echo "$RESPONSE" | grep -q '"muted":true'; then
  echo "Bridge is muted, message not sent"
else
  echo "Bridge response: $RESPONSE"
fi
