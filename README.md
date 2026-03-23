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
| `isGroup` | boolean | No | Whether this is a group chat (default: false) |
| `messageId` | string | No | Optional message ID for deduplication |

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

## License

MIT
