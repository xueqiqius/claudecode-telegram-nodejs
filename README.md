# Claude Code Telegram 桥接器（Node.js + WezTerm）

通过 Telegram 与 Claude Code CLI 对话的桥接器，使用 WezTerm 在 Windows 上运行。

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
       │    Stop Hook            │   Claude Code   │
       └──────────────────────── │   (在 WezTerm)  │
         (读取对话记录,           └─────────────────┘
          发送到 Telegram)
