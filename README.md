# Claude Code Telegram 桥接器（Node.js + WezTerm）

通过 Telegram 与 Claude Code CLI 对话的桥接器，使用 WezTerm 。
支持与多个claude code 窗口交互。
从bot发送消息给claude时，需先使用/setpane X指定具体哪个WezTerm窗口。
所有的claude消息都会发送到bot，消息包含claude目录和SessionID。


> **新手？** 请阅读 [完整配置指南](SETUP_GUIDE.md) 获取详细的分步说明和问题排查。

## 架构

```
┌─────────────┐     webhook      ┌─────────────────┐
│  Telegram   │ ───────────────► │  Node.js 桥接器  │
└─────────────┘                  └────────┬────────┘
       ▲                                  │
       │                                  │ wezterm cli send-text
       │                                  ▼
       │                         ┌─────────────────┐
       │    Stop Hook ──────────►│   Claude Code   │
       └──────────────────────── │   (在 WezTerm)  │
         (POST 到 Bridge,        └─────────────────┘
          Bridge 发送到 Telegram)
```

## Telegram 命令

| 命令 | 说明 |
|------|------|
| `/panes` | 列出所有 WezTerm 窗格 |
| `/setpane <id>` | 选择要操作的窗格 |
| `/status` | 查看当前状态 |
| `/stop` | 中断 Claude（发送 Escape） |
| `/clear` | 清除对话上下文 |
| `/resume` | 恢复之前的会话 |
| `/mute` | 静音（不接收 Claude 回复） |
| `/unmute` | 取消静音 |

## 注意事项

1. **必须使用 `--dangerously-skip-permissions` 启动 Claude Code**
   - 桥接器无法处理 Claude Code 的确认提示（如文件操作权限确认）
   - 启动命令：`claude --dangerously-skip-permissions`

2. **仅支持文本消息**
   - 目前只能处理文本类消息
   - 不支持图片、文件、语音等其他类型的消息

3. **跨平台支持**
   - Windows: 使用 `hooks/send-to-telegram.cmd`
   - Linux/macOS: 使用 `hooks/send-to-telegram.sh`

## 详细配置

请参考 [SETUP_GUIDE.md](SETUP_GUIDE.md) 获取完整的配置说明。

## 许可证

MIT
