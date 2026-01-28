#!/usr/bin/env node

/**
 * Claude Code Stop Hook - Sends Claude's response to Telegram
 *
 * This script is called by Claude Code when it finishes responding.
 * It reads the transcript, extracts the last assistant message, and sends it to Telegram.
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
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const CHAT_ID_FILE = path.join(CLAUDE_DIR, 'telegram_chat_id');
const PENDING_FILE = path.join(CLAUDE_DIR, 'telegram_pending');

// Telegram message limit
const MAX_MESSAGE_LENGTH = 4000;

// Timeout for pending requests (10 minutes)
const PENDING_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Send a message via Telegram Bot API
 */
async function sendTelegramMessage(chatId, text, parseMode = 'HTML') {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, MAX_MESSAGE_LENGTH),
        parse_mode: parseMode
      })
    });

    const data = await response.json();

    // If HTML parsing fails, retry with plain text
    if (!data.ok && parseMode === 'HTML') {
      console.error('HTML parse failed, retrying as plain text');
      return sendTelegramMessage(chatId, text, null);
    }

    return data;
  } catch (error) {
    console.error('Failed to send Telegram message:', error.message);
    return { ok: false, error: error.message };
  }
}

/**
 * Convert Markdown to Telegram HTML
 */
function markdownToTelegramHtml(text) {
  let result = text;

  // Escape HTML special characters first (except in code blocks)
  const escapeHtml = (str) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Extract code blocks first to protect them
  const codeBlocks = [];
  result = result.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
    const index = codeBlocks.length;
    codeBlocks.push(`<pre><code>${escapeHtml(code.trim())}</code></pre>`);
    return `__CODE_BLOCK_${index}__`;
  });

  // Extract inline code
  const inlineCodes = [];
  result = result.replace(/`([^`]+)`/g, (match, code) => {
    const index = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `__INLINE_CODE_${index}__`;
  });

  // Now escape HTML in the remaining text
  result = escapeHtml(result);

  // Convert markdown formatting
  result = result.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');  // Bold
  result = result.replace(/\*(.+?)\*/g, '<i>$1</i>');      // Italic
  result = result.replace(/__(.+?)__/g, '<u>$1</u>');      // Underline (avoid conflict with placeholders)
  result = result.replace(/~~(.+?)~~/g, '<s>$1</s>');      // Strikethrough

  // Restore code blocks and inline code
  codeBlocks.forEach((block, index) => {
    result = result.replace(`__CODE_BLOCK_${index}__`, block);
  });

  inlineCodes.forEach((code, index) => {
    result = result.replace(`__INLINE_CODE_${index}__`, code);
  });

  return result;
}

/**
 * Extract the last assistant message from transcript
 */
async function extractLastAssistantMessage(transcriptPath) {
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
 * Check if there's a pending Telegram request
 */
function isPending() {
  if (!fs.existsSync(PENDING_FILE)) {
    return false;
  }

  try {
    const timestamp = parseInt(fs.readFileSync(PENDING_FILE, 'utf-8'), 10);
    const age = Date.now() - timestamp;

    // Check if pending request is within timeout
    return age < PENDING_TIMEOUT_MS;
  } catch (e) {
    return false;
  }
}

/**
 * Clear pending state
 */
function clearPending() {
  if (fs.existsSync(PENDING_FILE)) {
    fs.unlinkSync(PENDING_FILE);
  }
}

/**
 * Get saved chat ID
 */
function getChatId() {
  if (!fs.existsSync(CHAT_ID_FILE)) {
    return null;
  }

  try {
    return fs.readFileSync(CHAT_ID_FILE, 'utf-8').trim();
  } catch (e) {
    return null;
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

  // Check if there's a pending Telegram request
  if (!isPending()) {
    console.log('No pending Telegram request, skipping');
    process.exit(0);
  }

  // Get chat ID
  const chatId = getChatId();
  if (!chatId) {
    console.error('No chat ID found');
    process.exit(1);
  }

  // Check for bot token
  if (!BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN not set');
    process.exit(1);
  }

  // Extract transcript path from hook input
  const transcriptPath = hookInput.transcript_path;
  if (!transcriptPath) {
    console.error('No transcript path in hook input');
    process.exit(1);
  }

  // Expand ~ in path if needed
  const expandedPath = transcriptPath.replace(/^~/, os.homedir());

  // Extract the last assistant message
  const message = await extractLastAssistantMessage(expandedPath);

  if (!message) {
    console.log('No assistant message found in transcript');
    clearPending();
    process.exit(0);
  }

  // Convert to Telegram HTML and send
  const htmlMessage = markdownToTelegramHtml(message);
  const result = await sendTelegramMessage(chatId, htmlMessage);

  if (result.ok) {
    console.log('Message sent to Telegram successfully');
  } else {
    console.error('Failed to send message:', result);
  }

  // Clear pending state
  clearPending();
}

main().catch(error => {
  console.error('Hook error:', error);
  process.exit(1);
});
