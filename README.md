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
```

## 注意事项

1. **必须使用 `--dangerously-skip-permissions` 启动 Claude Code**
   - 桥接器无法处理 Claude Code 的确认提示（如文件操作权限确认）
   - 启动命令：`claude --dangerously-skip-permissions`

2. **仅支持文本消息**
   - 目前只能处理文本类消息
   - 不支持图片、文件、语音等其他类型的消息

3. **跨平台支持**
   - 核心代码可在 Linux/macOS 上运行
   - 但需要修改 `hooks/send-to-telegram.cmd` 为 shell 脚本
   - Windows 使用 `.cmd`，Linux/macOS 需改为 `.sh`

## 详细配置

请参考 [SETUP_GUIDE.md](SETUP_GUIDE.md) 获取完整的配置说明。

## 许可证

MIT
