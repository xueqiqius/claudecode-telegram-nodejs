
## 1. 环境要求

| 软件 | 检查方法 | 安装方式 |
|------|----------|----------|
| **Node.js 18+** | 运行 `node --version` | 从 [nodejs.org](https://nodejs.org/) 下载 |
| **WezTerm** | 运行 `wezterm --version` | 从 [wezfurlong.org/wezterm](https://wezfurlong.org/wezterm/) 下载 |
| **Claude Code CLI** | 运行 `claude --version` | 运行 `npm install -g @anthropic-ai/claude-code` |
| **Telegram 账号** | - | 下载 Telegram 应用 |

## 2. 创建 Telegram 机器人，打开Telegram ，在搜索栏输入 `@BotFather` ，发送 `/start` 之后按提示创建bot。
	创建成功后，BotFather 会发送类似这样的消息：Use this token to access the HTTP API:7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
	复制这个 Token（类似 `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` 的部分）并妥善保存。后面会用到。


## 3. 克隆这个仓库，比如 D:/claudecode-telegram-nodejs，之后进入项目目录
	将.env.example文件改名为 .env ，修改文件，TELEGRAM_BOT_TOKEN 替换为之前步骤保存的 Token，配置桥接程序运行的端口号


## 4. 配置 Claude Code Hook，找到 Claude 配置文件 %USERPROFILE%\.claude\settings.json ，用文本编辑器打开 `settings.json`。

**情况一：文件不存在或为空**

创建文件并写入以下内容：

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"D:/claudecode-telegram-nodejs/hooks/send-to-telegram.cmd\""
          }
        ]
      }
    ]
  }
}
```

**情况二：已有 Stop hook**

在 `Stop` 数组中添加新的 hook 对象：

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [...]  // 已有的 hook
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"D:/claudecode-telegram-nodejs/hooks/send-to-telegram.cmd\""
          }
        ]
      }
    ]
  }
}
```


## 5. 将bot 回调服务暴露到公网

1、有公网就直接暴露端口，需要配置证书，因为telegram回调需要使用https。

2、没有公网就 Cloudflare Tunnel

	a. **安装 cloudflared**：
	   ```powershell
	   winget install Cloudflare.cloudflared
	   ```
	
	b. **启动隧道**：
	   ```powershell
	   cloudflared tunnel --url http://localhost:3007
	   ```

	c. **复制 URL**：从输出中复制（类似 `https://xxx.trycloudflare.com`）

---

## 6. 注册 Telegram Webhook ,需要告诉 Telegram 将消息发送到哪里。
组合url后直接浏览器访问即可 https://api.telegram.org/bot7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/setWebhook?url=https://abc123.ngrok-free.app
你应该看到：{"ok":true,"result":true,"description":"Webhook was set"}

## 7. 启动桥接程序
cd D:\\claudecode-telegram-nodejs
npm start

然后用wezterm启动一个 Claude Code测试，当然，也可以操作powershell，cmd等。

## 8. 测试 ,在 Telegram 中打开创建的机器人， 输入/status ，应该收到：
```
✅ Claude Code session active (pane: 0)
```

## 9 使用说明
先使用 /panes ,获取wezterm所有窗口,会收到回复
	WezTerm 窗格列表:
	
	3 - ✳️ Claude Code
	5 ✅ - 管理员: ✳️ Model Identification
	17 - powershell.exe
	
再使用 /setpane 3 ,激活你要使用的窗口，会收到提示”已选择窗格 5“。
之后直接发具体内容即可，bot会把内容发给桥接程序，桥接程序会把内容发给wezterm窗口。
当claude code完成时，消息会被hooks捕获，然后通过D:/claudecode-telegram-nodejs/hooks/send-to-telegram.cmd发送给bot。


enjoy it！
