import http from 'node:http';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
  console.log('Loaded configuration from .env file');
}

// Configuration from environment variables
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PORT = parseInt(process.env.PORT || '3007', 10);
const WEZTERM_PANE_ID = process.env.WEZTERM_PANE_ID; // Optional: specific pane ID

// Paths for state files
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const CHAT_ID_FILE = path.join(CLAUDE_DIR, 'telegram_chat_id');
const PENDING_FILE = path.join(CLAUDE_DIR, 'telegram_pending');
const PANE_ID_FILE = path.join(CLAUDE_DIR, 'telegram_pane_id');

// Ensure .claude directory exists
if (!fs.existsSync(CLAUDE_DIR)) {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
}

// Selected pane ID (loaded from file or null)
let selectedPaneId = null;

// Load saved pane ID if exists
if (fs.existsSync(PANE_ID_FILE)) {
  try {
    selectedPaneId = fs.readFileSync(PANE_ID_FILE, 'utf-8').trim();
    console.log(`Loaded saved pane ID: ${selectedPaneId}`);
  } catch (e) {
    // ignore
  }
}

// Blocked commands that require interactive input
const BLOCKED_COMMANDS = ['/mcp', '/help', '/config', '/settings', '/model', '/vim', '/terminal-setup'];

// Typing indicator state
let typingInterval = null;

/**
 * Make a request to the Telegram Bot API
 */
async function telegramApi(method, body = {}) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (!data.ok) {
      console.error(`Telegram API error: ${data.description}`);
    }
    return data;
  } catch (error) {
    console.error(`Telegram API request failed: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

/**
 * Send a message to Telegram
 */
async function sendMessage(chatId, text, options = {}) {
  return telegramApi('sendMessage', {
    chat_id: chatId,
    text: text.slice(0, 4000), // Telegram's limit
    parse_mode: options.parseMode || 'HTML',
    ...options
  });
}

/**
 * Start typing indicator loop
 */
function startTypingLoop(chatId) {
  stopTypingLoop();

  const sendTyping = () => telegramApi('sendChatAction', { chat_id: chatId, action: 'typing' });
  sendTyping();
  typingInterval = setInterval(sendTyping, 5000);
}

/**
 * Stop typing indicator loop
 */
function stopTypingLoop() {
  if (typingInterval) {
    clearInterval(typingInterval);
    typingInterval = null;
  }
}

/**
 * Get list of WezTerm panes
 */
function getWeztermPanes() {
  try {
    const output = execSync('wezterm cli list --format json', { encoding: 'utf-8' });
    return JSON.parse(output);
  } catch (error) {
    console.error('Failed to list WezTerm panes:', error.message);
    return [];
  }
}

/**
 * Save selected pane ID to file
 */
function saveSelectedPaneId(paneId) {
  selectedPaneId = paneId;
  fs.writeFileSync(PANE_ID_FILE, paneId.toString(), 'utf-8');
}

/**
 * Clear selected pane ID
 */
function clearSelectedPaneId() {
  selectedPaneId = null;
  if (fs.existsSync(PANE_ID_FILE)) {
    fs.unlinkSync(PANE_ID_FILE);
  }
}

/**
 * Check if a pane ID exists in current panes
 */
function paneExists(paneId) {
  const panes = getWeztermPanes();
  return panes.some(p => String(p.pane_id) === String(paneId));
}

/**
 * Find the Claude Code pane (uses selected pane only - no auto-detect)
 */
function findClaudePaneId() {
  // Only use user-selected pane - no auto-detection
  if (selectedPaneId !== null) {
    // Verify pane still exists
    if (paneExists(selectedPaneId)) {
      return selectedPaneId;
    } else {
      console.log(`Selected pane ${selectedPaneId} no longer exists, clearing selection`);
      clearSelectedPaneId();
    }
  }

  // Fallback to env var if set
  if (process.env.WEZTERM_PANE_ID) {
    return process.env.WEZTERM_PANE_ID;
  }

  // No auto-detection - user must use /setpane
  return null;
}

/**
 * Check if WezTerm/Claude session exists
 */
function sessionExists() {
  const paneId = findClaudePaneId();
  return paneId !== null;
}

/**
 * Send text to WezTerm pane
 */
function weztermSendText(text) {
  const paneId = findClaudePaneId();

  if (!paneId) {
    throw new Error('未选择窗格，请先使用 /setpane 选择');
  }

  try {
    // Escape double quotes for cmd
    const escapedText = text.replace(/"/g, '""');

    // Send text directly as argument (no pipe, no extra newline)
    execSync(`wezterm cli send-text --pane-id ${paneId} --no-paste "${escapedText}"`, {
      encoding: 'utf-8'
    });

    // Send Enter key using PowerShell's `r (carriage return)
    execSync(`powershell -NoProfile -Command "wezterm cli send-text --pane-id ${paneId} --no-paste \"\`r\""`, {
      encoding: 'utf-8'
    });

    return true;
  } catch (error) {
    console.error('Failed to send text to WezTerm:', error.message);
    throw error;
  }
}

/**
 * Send Escape key to WezTerm pane
 */
function weztermSendEscape() {
  const paneId = findClaudePaneId();

  if (!paneId) {
    return false;
  }

  try {
    // Send Escape character using PowerShell escape sequence `e
    execSync(`powershell -NoProfile -Command "wezterm cli send-text --pane-id ${paneId} --no-paste \"\`e\""`, {
      encoding: 'utf-8'
    });
    return true;
  } catch (error) {
    console.error('Failed to send Escape to WezTerm:', error.message);
    return false;
  }
}

/**
 * Save chat ID for the stop hook to use
 */
function saveChatId(chatId) {
  fs.writeFileSync(CHAT_ID_FILE, chatId.toString(), 'utf-8');
}

/**
 * Mark a request as pending (for the stop hook)
 */
function setPending() {
  fs.writeFileSync(PENDING_FILE, Date.now().toString(), 'utf-8');
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
 * Setup bot commands in Telegram
 */
async function setupBotCommands() {
  const commands = [
    { command: 'panes', description: '列出所有 WezTerm 窗格' },
    { command: 'setpane', description: '设置活动窗格 (例如: /setpane 3)' },
    { command: 'status', description: '检查当前状态' },
    { command: 'stop', description: '中断 Claude（发送 Escape）' },
    { command: 'clear', description: '清除对话上下文' },
    { command: 'resume', description: '恢复之前的会话' },
    { command: 'refresh', description: '刷新机器人命令' },
    { command: 'help', description: '显示帮助信息' }
  ];

  const result = await telegramApi('setMyCommands', { commands });
  if (result.ok) {
    console.log('Bot commands registered successfully');
  } else {
    console.error('Failed to register bot commands:', result);
  }
}

/**
 * Handle incoming bot commands
 */
async function handleCommand(chatId, command, args) {
  saveChatId(chatId);

  switch (command) {
    case '/start':
    case '/help':
      await sendMessage(chatId, `
<b>Claude Code Telegram 桥接器</b>

<b>窗格管理:</b>
/panes - 列出所有 WezTerm 窗格
/setpane &lt;id&gt; - 设置活动窗格

<b>会话控制:</b>
/status - 检查会话状态
/stop - 中断 Claude（Escape）
/clear - 清除对话
/resume - 恢复之前的会话

<b>使用方法:</b>
直接发送消息即可与 Claude Code 对话！

<b>注意:</b> 请先用 /panes 查看并用 /setpane 选择正确的窗格。
      `.trim());
      break;

    case '/panes': {
      const panes = getWeztermPanes();
      if (panes.length === 0) {
        await sendMessage(chatId, '❌ 没有找到 WezTerm 窗格\n\n请确保 WezTerm 正在运行。');
        break;
      }

      const currentPaneId = findClaudePaneId();
      let message = '<b>WezTerm 窗格列表:</b>\n\n';

      for (const pane of panes) {
        const isSelected = String(pane.pane_id) === String(currentPaneId);
        const marker = isSelected ? ' ✅' : '';
        const title = pane.title || '(无标题)';
        message += `<b>${pane.pane_id}</b>${marker} - ${title}\n`;
      }

      message += '\n使用 /setpane &lt;id&gt; 选择窗格';
      if (currentPaneId !== null) {
        message += `\n\n当前选择: <b>${currentPaneId}</b>`;
      }

      await sendMessage(chatId, message);
      break;
    }

    case '/setpane': {
      if (!args || !args.trim()) {
        await sendMessage(chatId, '⚠️ 请提供窗格 ID\n\n用法: /setpane &lt;id&gt;\n例如: /setpane 3\n\n使用 /panes 查看可用窗格');
        break;
      }

      const paneId = args.trim();
      const panes = getWeztermPanes();
      const paneExists = panes.some(p => String(p.pane_id) === paneId);

      if (!paneExists) {
        await sendMessage(chatId, `❌ 窗格 ${paneId} 不存在\n\n使用 /panes 查看可用窗格`);
        break;
      }

      saveSelectedPaneId(paneId);
      const pane = panes.find(p => String(p.pane_id) === paneId);
      const title = pane?.title || '(无标题)';
      await sendMessage(chatId, `✅ 已选择窗格 <b>${paneId}</b>\n标题: ${title}\n\n现在可以发送消息了！`);
      break;
    }

    case '/status': {
      const panes = getWeztermPanes();
      const currentPaneId = findClaudePaneId();

      if (currentPaneId !== null) {
        const pane = panes.find(p => String(p.pane_id) === String(currentPaneId));
        const title = pane?.title || '(无标题)';
        await sendMessage(chatId, `✅ 已就绪\n\n窗格 ID: <b>${currentPaneId}</b>\n标题: ${title}`);
      } else {
        await sendMessage(chatId, '❌ 未选择窗格\n\n请使用 /panes 查看窗格列表\n然后使用 /setpane &lt;id&gt; 选择窗格');
      }
      break;
    }

    case '/refresh':
      await setupBotCommands();
      await sendMessage(chatId, '✅ 已刷新机器人命令\n\n请退出聊天并重新进入，或重启 Telegram 查看新命令。');
      break;

    case '/stop':
      if (weztermSendEscape()) {
        await sendMessage(chatId, '⏹ 已发送中断信号');
      } else {
        await sendMessage(chatId, '❌ 发送中断失败');
      }
      stopTypingLoop();
      clearPending();
      break;

    case '/clear':
      if (findClaudePaneId() !== null) {
        weztermSendText('/clear');
        await sendMessage(chatId, '🗑 对话已清除');
      } else {
        await sendMessage(chatId, '❌ 未选择窗格');
      }
      break;

    case '/resume':
      if (findClaudePaneId() !== null) {
        weztermSendText('/resume');
        await sendMessage(chatId, '▶️ 正在恢复之前的会话...');
      } else {
        await sendMessage(chatId, '❌ 未选择窗格');
      }
      break;

    default:
      // Check if it's a blocked command
      if (BLOCKED_COMMANDS.some(cmd => command.startsWith(cmd))) {
        await sendMessage(chatId, `⚠️ 命令 ${command} 需要交互式输入，不支持通过 Telegram 使用。`);
      } else {
        await sendMessage(chatId, `未知命令: ${command}`);
      }
  }
}

/**
 * Handle regular messages (send to Claude)
 */
async function handleMessage(chatId, text) {
  saveChatId(chatId);

  // Check if pane is selected
  const paneId = findClaudePaneId();
  if (paneId === null) {
    await sendMessage(chatId, '❌ 未选择窗格\n\n请先执行以下步骤:\n1. /panes - 查看窗格列表\n2. /setpane &lt;id&gt; - 选择 Claude Code 所在的窗格');
    return;
  }

  // Check for blocked commands being sent as regular text
  if (BLOCKED_COMMANDS.some(cmd => text.toLowerCase().startsWith(cmd))) {
    await sendMessage(chatId, `⚠️ 此命令需要交互式输入，不支持通过 Telegram 使用。`);
    return;
  }

  try {
    // Mark as pending for the stop hook
    setPending();

    // Start typing indicator
    startTypingLoop(chatId);

    // Send message to Claude Code via WezTerm
    weztermSendText(text);

    console.log(`Message sent to Claude (pane ${paneId}): ${text.slice(0, 50)}...`);
  } catch (error) {
    stopTypingLoop();
    clearPending();
    await sendMessage(chatId, `❌ 错误: ${error.message}`);
  }
}

/**
 * Handle incoming webhook requests
 */
async function handleWebhook(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  let body = '';

  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const update = JSON.parse(body);

      // Handle message updates
      if (update.message) {
        const chatId = update.message.chat.id;
        const text = update.message.text || '';

        if (text.startsWith('/')) {
          const [command, ...args] = text.split(' ');
          await handleCommand(chatId, command.toLowerCase(), args.join(' '));
        } else if (text.trim()) {
          await handleMessage(chatId, text);
        }
      }

      // Handle callback queries (button presses)
      if (update.callback_query) {
        const chatId = update.callback_query.message.chat.id;
        const data = update.callback_query.data;

        // Acknowledge the callback
        await telegramApi('answerCallbackQuery', {
          callback_query_id: update.callback_query.id
        });

        // Handle the callback action
        if (data.startsWith('resume:')) {
          const sessionId = data.replace('resume:', '');
          weztermSendText(`/resume ${sessionId}`);
          await sendMessage(chatId, `▶️ Resuming session ${sessionId}...`);
        }
      }

      res.writeHead(200);
      res.end('OK');
    } catch (error) {
      console.error('Webhook error:', error);
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  });
}

/**
 * Main entry point
 */
async function main() {
  if (!BOT_TOKEN) {
    console.error('Error: TELEGRAM_BOT_TOKEN environment variable is required');
    process.exit(1);
  }

  // Setup bot commands
  await setupBotCommands();

  // Create HTTP server
  const server = http.createServer(handleWebhook);

  server.listen(PORT, () => {
    console.log(`Claude Code Telegram Bridge`);
    console.log(`============================`);
    console.log(`Server running on port ${PORT}`);
    console.log(`Bot token: ${BOT_TOKEN.slice(0, 10)}...`);
    console.log(`\nNext steps:`);
    console.log(`1. Start Claude Code in WezTerm: claude`);
    console.log(`2. Expose this port to the internet`);
    console.log(`3. Register webhook with Telegram:`);
    console.log(`   curl "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=YOUR_PUBLIC_URL"`);
  });
}

// Export for stop hook to use
export { sendMessage, stopTypingLoop, clearPending };

main().catch(console.error);
