# openclaw-custom-webhook

Custom HTTP Webhook channel plugin for [OpenClaw](https://github.com/openclaw/openclaw). Receive messages via HTTP POST and get AI agent replies — perfect for integrating OpenClaw with any external system.

## Installation

```bash
openclaw plugins install openclaw-custom-webhook
```

Or via npx:

```bash
npx openclaw-custom-webhook setup
```

## Quick Start

### 1. Install the plugin

```bash
openclaw plugins install openclaw-custom-webhook
```

### 2. Configure

Run the interactive setup:

```bash
npx openclaw-custom-webhook setup
```

Or manually add to `~/.openclaw/openclaw.json`:

```json
{
  "channels": {
    "custom-webhook": {
      "accounts": {
        "default": {
          "receiveSecret": "your-secret-token",
          "pushUrl": "http://your-backend.com/webhook/receive",
          "pushSecret": "your-push-secret"
        }
      }
    }
  }
}
```

### 3. Restart gateway

```bash
openclaw gateway restart
```

### 4. Send a message

```bash
curl -X POST http://localhost:18789/api/plugins/custom-webhook/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '{"senderId":"user1","chatId":"chat1","text":"Hello!"}'
```

**Response:**

```json
{
  "ok": true,
  "reply": "Hey! I'm your AI assistant. How can I help?",
  "timestamp": 1774290802998
}
```

## API Reference

### `POST /api/plugins/custom-webhook/webhook`

**Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer <receiveSecret>` |
| `Content-Type` | Yes | `application/json` |

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `senderId` | string | Yes | Unique sender identifier |
| `chatId` | string | No | Conversation ID (defaults to senderId) |
| `text` | string | Yes | Message content |
| `attachments` | array | No | Media attachments (see below) |
| `isGroup` | boolean | No | Whether this is a group chat (default: false) |
| `messageId` | string | No | Optional message ID for deduplication |

**Attachments format:**
```json
{
  "attachments": [
    {"type": "image", "url": "https://example.com/photo.jpg"},
    {"type": "file", "url": "https://example.com/doc.pdf", "name": "document.pdf"}
  ]
}
```

**Response (200 OK):**

```json
{
  "ok": true,
  "reply": "Agent's response text",
  "timestamp": 1774290802998
}
```

**Error Responses:**

- `401`: Invalid or missing authorization
- `500`: Internal processing error

## Configuration Options

| Field           | Description                                         |
| --------------- | --------------------------------------------------- |
| `receiveSecret` | Bearer token for authenticating incoming webhooks   |
| `pushUrl`       | URL to forward agent replies to (optional)          |
| `pushSecret`    | Bearer token for push URL authentication (optional) |

## Push Notifications

When `pushUrl` is configured, agent replies are automatically pushed:

```json
{
  "type": "agent_reply",
  "senderId": "user1",
  "chatId": "chat1",
  "reply": "Agent's response",
  "timestamp": 1774290802998
}
```

## CLI Commands

```bash
npx openclaw-custom-webhook setup   # Interactive configuration
npx openclaw-custom-webhook test     # Send a test message
npx openclaw-custom-webhook help     # Show help
```

## Features

- ✅ Full OpenClaw agent pipeline integration (like Feishu/Telegram)
- ✅ Multi-turn conversation support with context retention
- ✅ Bearer token authentication
- ✅ Push notifications to external backends
- ✅ Interactive CLI setup
- ✅ Works with any HTTP client (curl, Postman, your app)

## Troubleshooting

### 发消息返回 "not found"

1. **必须重启 gateway**：安装插件后需要重启 gateway 才能加载
   ```bash
   openclaw gateway restart
   ```

2. **确认插件加载成功**：检查 gateway 启动日志中是否有：
   ```
   [plugins] [custom-webhook] Registering HTTP route at /api/plugins/custom-webhook/webhook
   ```
   如果没有，说明插件未加载。

3. **确认插件已安装**：
   ```bash
   ls ~/.openclaw/extensions/custom-webhook/
   # 应包含 index.ts, openclaw.plugin.json, package.json 等
   ```

4. **确认配置正确**：
   ```bash
   grep -A10 "custom-webhook" ~/.openclaw/openclaw.json
   # 应包含 "enabled": true 和 accounts 配置
   ```

5. **检查 OpenClaw 版本**（需要 >= 2026.3.22）：
   ```bash
   openclaw --version
   ```

6. **带调试日志启动**：
   ```bash
   OPENCLAW_PLUGIN_LOADER_DEBUG_STACKS=1 openclaw gateway run --force
   ```

### 找不到 plugin-sdk

`openclaw/plugin-sdk` 由 OpenClaw 运行时自动提供（通过 jiti 别名），不需要手动安装。如果报错：

- 确认 OpenClaw 版本 >= 2026.3.22
- 确认是通过 `openclaw plugins install` 安装的（不要手动 npm install）
- 尝试重新安装：
  ```bash
  rm -rf ~/.openclaw/extensions/custom-webhook
  openclaw plugins install openclaw-custom-webhook
  openclaw gateway restart
  ```

### gateway 绑定了 loopback

如果从外部机器访问，gateway 需要绑定到 `0.0.0.0`：
```bash
openclaw gateway run --bind 0.0.0.0 --port 18789 --force
```

## License

MIT
