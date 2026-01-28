#!/usr/bin/env node

/**
 * Claude Code Stop Hook - Sends Claude's response to Bridge
 *
 * This script is called by Claude Code when it finishes responding.
 * It reads the transcript, extracts the last assistant message, and sends it to the bridge.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

// Load .env file if exists
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=');
      if (key && value && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

// Configuration
const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:3007/hook';

/**
 * Extract the last assistant message from transcript
 */
function extractLastAssistantMessage(transcriptPath) {
  if (!fs.existsSync(transcriptPath)) {
    console.error('Transcript file not found:', transcriptPath);
    return null;
  }

  const content = fs.readFileSync(transcriptPath, 'utf-8');
  const lines = content.trim().split('\n');

  // Read from the end to find the last assistant message
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);

      // Look for assistant message
      if (entry.type === 'assistant' && entry.message) {
        // Extract text content from the message
        const textParts = [];

        if (Array.isArray(entry.message.content)) {
          for (const block of entry.message.content) {
            if (block.type === 'text' && block.text) {
              textParts.push(block.text);
            }
          }
        } else if (typeof entry.message.content === 'string') {
          textParts.push(entry.message.content);
        }

        if (textParts.length > 0) {
          return textParts.join('\n');
        }
      }
    } catch (e) {
      // Skip invalid JSON lines
      continue;
    }
  }

  return null;
}

/**
 * Send message to bridge
 */
async function sendToBridge(message, cwd, sessionId) {
  try {
    const response = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, cwd, sessionId })
    });

    const data = await response.json();
    return data;
  } catch (error) {
    // Bridge might not be running - this is OK
    console.log('Bridge not available:', error.message);
    return { ok: false, error: error.message };
  }
}

/**
 * Main entry point
 */
async function main() {
  // Read hook input from stdin
  let inputData = '';

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false
  });

  for await (const line of rl) {
    inputData += line;
  }

  let hookInput;
  try {
    hookInput = JSON.parse(inputData);
  } catch (e) {
    console.error('Failed to parse hook input:', e.message);
    process.exit(1);
  }

  // Check if this is a stop event
  if (hookInput.hook_event_name !== 'Stop') {
    process.exit(0);
  }

  // Extract transcript path from hook input
  const transcriptPath = hookInput.transcript_path;
  if (!transcriptPath) {
    console.error('No transcript path in hook input');
    process.exit(1);
  }

  // Expand ~ in path if needed
  const expandedPath = transcriptPath.replace(/^~/, os.homedir());

  // Extract source info from hook input
  const cwd = hookInput.cwd || '未知目录';
  const sessionId = path.basename(transcriptPath, '.jsonl');

  // Extract the last assistant message
  const message = extractLastAssistantMessage(expandedPath);

  if (!message) {
    console.log('No assistant message found in transcript');
    process.exit(0);
  }

  // Send to bridge
  const result = await sendToBridge(message, cwd, sessionId);

  if (result.ok) {
    console.log('Message sent to bridge successfully');
  } else if (result.muted) {
    console.log('Bridge is muted, message not sent');
  } else {
    console.log('Bridge response:', result);
  }
}

main().catch(error => {
  console.error('Hook error:', error);
  process.exit(1);
});
