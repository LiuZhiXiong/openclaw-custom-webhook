[中文](./README.zh-CN.md) | English

# 🦞 OpenClaw Custom Webhook

[![npm version](https://img.shields.io/npm/v/openclaw-custom-webhook.svg)](https://www.npmjs.com/package/openclaw-custom-webhook)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![OpenClaw: v2026.3+](https://img.shields.io/badge/OpenClaw-v2026.3+-orange.svg)](https://github.com/openclaw/openclaw)

**Turn any HTTP client into a two-way OpenClaw AI Agent channel.** Send messages to your agents and receive push callbacks when they reply -- no custom SDKs required.

```
              +----------------------------+
              |   OpenClaw Agent (AI)      |
              +-------------+--------------+
                            |
              +-------------+---------------+
              |    Custom Webhook Plugin    |
              +--+------------------------+-+
                 |                        |
   +-------------v-----------+  +---------v-----------------+
   |  Send to Agent          |  |  Receive from Agent       |
   |  POST /webhook          |  |  Agent -> your pushUrl    |
   |  sync reply / async 202 |  |  HMAC signed + auto-retry |
   +-------------------------+  +---------------------------+
```

## Why

OpenClaw natively supports Telegram, Discord, Slack, etc. But what if you need to connect:

- A WeCom (企业微信) bot
- An internal SaaS tool
- A mobile app backend
- An IoT device
- A CI/CD pipeline with AI capabilities

**Custom Webhook is the universal adapter** — any system that can send HTTP requests can talk to your OpenClaw agents, with full multi-turn conversation support.

---

## Quick Start

```bash
# Install
npx openclaw-custom-webhook install

# Open the test panel in your browser
npx openclaw-custom-webhook open
```

Or send your first message directly:

```bash
curl -X POST http://localhost:18789/api/plugins/custom-webhook/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SECRET" \
  -d '{"senderId": "user-1", "text": "Hello!"}'
```

```json
{
  "ok": true,
  "reply": "Hey! 👋 How can I help?",
  "timestamp": 1774463000000
}
```

---

## Features

| Feature | Description |
|---------|-------------|
| **Multi-Turn Conversations** | Same `senderId` = same session. The agent remembers context across messages automatically |
| **Sync & Async Modes** | Wait for reply, or get 202 and receive results via push callback |
| **Web Test Panel** | Built-in chat UI at `/panel` with dark/light themes, auth persistence, message history |
| **Idempotent Delivery** | `messageId` deduplication prevents duplicate agent processing (5-min TTL) |
| **Multi-Modal Input** | Send images and files via `attachments[]` for the agent's vision pipeline |
| **Reliable Push** | Async replies auto-retry 3× with exponential backoff |
| **Rate Limiting** | Sliding-window rate limiter (configurable, default 30 req/min) |
| **HMAC Signing** | Outbound push callbacks are signed with SHA-256 HMAC for verification |
| **Health & Events** | Real-time health check + ring-buffer event log for debugging |
| **OpenAPI 3.0 Spec** | Machine-readable spec at `/openapi.json` for Postman/AI tool import |

---

## CLI Commands

```bash
npx openclaw-custom-webhook [command]
```

| Command | Description |
|---------|-------------|
| `install` | Install plugin, setup SDK symlink, configure secrets, restart gateway |
| `status` | Show gateway health, endpoints, and loaded config |
| `open` | Open Web Panel in default browser |
| `test` | Send a quick test message from the terminal |
| `setup` | Interactively configure `receiveSecret` and `pushUrl` |
| `fix-sdk` | Repair `plugin-sdk` symlink after npm updates |
| `uninstall` | Remove plugin and clean up `openclaw.json` config |

---

## API Reference

> **Base URL**: `http://localhost:18789/api/plugins/custom-webhook`
>
> **Auth**: `Authorization: Bearer <receiveSecret>`

### Send Message

```
POST /webhook
```

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `senderId` | string | ✅ | Unique user identifier. Same ID = same conversation session |
| `text` | string | ✅ | Message text |
| `chatId` | string | — | Chat/group ID (defaults to `senderId`) |
| `messageId` | string | — | For idempotent delivery. Auto-generated if omitted |
| `async` | boolean | — | `true` to return 202 immediately; reply pushed to `pushUrl` |
| `isGroup` | boolean | — | `true` if message is from a group chat |
| `attachments` | array | — | Media files (see below) |

#### Attachments Format

```json
{
  "attachments": [
    { "url": "https://example.com/photo.jpg", "type": "image", "name": "photo.jpg" },
    { "url": "https://example.com/doc.pdf", "type": "file", "name": "report.pdf" }
  ]
}
```

#### Sync Response (200)

```json
{
  "ok": true,
  "reply": "Agent's response text",
  "attachments": [
    { "type": "image", "url": "https://cdn.example.com/generated.png" }
  ],
  "timestamp": 1774463000000
}
```

#### Async Response (202)

```json
{
  "ok": true,
  "async": true,
  "messageId": "wh-1774463000000"
}
```

The agent will POST results to your configured `pushUrl`:

```json
{
  "type": "agent_reply",
  "senderId": "user-1",
  "chatId": "user-1",
  "reply": "Here's the summary you requested...",
  "timestamp": 1774463005000
}
```

### System Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/panel` | GET | No | Web chat UI |
| `/docs` | GET | No | Swagger UI documentation |
| `/openapi.json` | GET | No | OpenAPI 3.0.3 spec |
| `/health` | GET | No | Gateway health + uptime |
| `/events` | GET | No | Recent event log (ring buffer) |

---

## Multi-Turn Conversations

The plugin automatically maintains conversation sessions. Messages with the **same `senderId`** are routed to the same agent session, so the agent remembers previous context:

```bash
# Message 1
curl -X POST .../webhook -H "Authorization: Bearer secret" \
  -d '{"senderId": "alice", "text": "My name is Alice"}'
# → "Nice to meet you, Alice!"

# Message 2 (same senderId)
curl -X POST .../webhook -H "Authorization: Bearer secret" \
  -d '{"senderId": "alice", "text": "What is my name?"}'
# → "Your name is Alice!"
```

Different `senderId` values create isolated sessions — perfect for multi-tenant applications.

---

## Configuration

The plugin reads its config from `~/.openclaw/openclaw.json`:

```json
{
  "channels": {
    "custom-webhook": {
      "accounts": {
        "default": {
          "receiveSecret": "YOUR_BEARER_TOKEN",
          "pushUrl": "https://your-backend.com/api/webhook-callback",
          "pushSecret": "TOKEN_FOR_YOUR_BACKEND"
        }
      }
    }
  }
}
```

| Key | Description |
|-----|-------------|
| `receiveSecret` | Bearer token required to call the webhook API |
| `pushUrl` | Your server's URL for receiving async agent replies |
| `pushSecret` | Token sent by OpenClaw in the `Authorization` header when pushing to your server |

---

## Security

### Authentication
All `/webhook` requests require a valid Bearer token matching `receiveSecret`.

### HMAC Request Signing (Optional)

OpenClaw **always sends signature headers** (when `pushSecret` is configured), but **verifying them is entirely your choice**:

| Strategy | When to use |
|----------|-------------|
| Verify Bearer Token only | Internal network, small projects, quick integration |
| Verify HMAC signature (recommended) | Public-facing `pushUrl`, production environments |
| Verify both | High-security requirements |
| Skip verification | Local testing only |

Every push request includes:
```
Authorization: Bearer <pushSecret>
X-Signature: sha256=<HMAC-SHA256 digest>
X-Timestamp: <millisecond timestamp>
```

> **Note**: `X-Timestamp` is generated **at push time**, not when the user sent the message.
> Even if the agent takes 10 minutes to respond, the timestamp on the push will always be "just now" — the 5-minute replay window will never false-positive.

**Use the raw request body for verification** — not `JSON.stringify(req.body)` — otherwise the signature will not match:

```javascript
const crypto = require('crypto');
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); }
}));

app.post('/receive', (req, res) => {
  const signature = req.headers['x-signature'];
  const timestamp  = req.headers['x-timestamp'];

  // Replay protection: reject requests older than 5 minutes
  if (Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000) {
    return res.status(401).json({ error: 'timestamp expired' });
  }

  // HMAC verification using raw body (not re-serialized JSON)
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.PUSH_SECRET)
    .update(`${timestamp}.${req.rawBody}`)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(401).json({ error: 'invalid signature' });
  }

  const { senderId, reply } = req.body;
  res.json({ ok: true });
});
```

### Rate Limiting
Sliding-window rate limiter at 30 requests/minute per IP. Returns `429 Too Many Requests` when exceeded.

### Request Size
Maximum body size: 10 MB.

---

## Architecture

```
~/.openclaw/extensions/custom-webhook/
├── index.ts              # Plugin entry: routes, Swagger UI, OpenAPI spec
├── src/
│   ├── panel/
│   │   └── template.ts   # Web Panel HTML template (dark/light themes)
│   └── services/
│       ├── hmac.ts        # HMAC-SHA256 signing for push callbacks
│       ├── rate-limiter.ts # Sliding-window rate limiter
│       └── push.ts        # Reliable push with retry logic
├── openclaw.plugin.json   # Plugin manifest
└── package.json
```

---

## Integration Examples

### Python

```python
import requests

resp = requests.post(
    "http://localhost:18789/api/plugins/custom-webhook/webhook",
    json={"senderId": "py-bot", "text": "Hello from Python!"},
    headers={"Authorization": "Bearer YOUR_SECRET"}
)
print(resp.json()["reply"])
```

### Node.js

```javascript
const resp = await fetch("http://localhost:18789/api/plugins/custom-webhook/webhook", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_SECRET"
  },
  body: JSON.stringify({ senderId: "node-bot", text: "Hello from Node!" })
});
const { reply } = await resp.json();
```

### WeCom Bot (企业微信)

```python
# In your WeCom message handler:
def on_message(msg):
    resp = requests.post(WEBHOOK_URL,
        json={"senderId": msg.from_user, "text": msg.content},
        headers={"Authorization": f"Bearer {SECRET}"}
    )
    return resp.json()["reply"]
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Cannot find module 'openclaw/plugin-sdk'` | Run `npx openclaw-custom-webhook fix-sdk` |
| Gateway not loading the plugin | Check `openclaw gateway restart` or look at `openclaw channels status` |
| 401 Unauthorized | Verify your `receiveSecret` in `~/.openclaw/openclaw.json` matches the Bearer token |
| 429 Too Many Requests | Rate limit exceeded. Wait 60 seconds or adjust rate limit config |
| Panel shows OFFLINE | Gateway may need restart: `openclaw gateway restart` |

---

## License

MIT © [LiuZhiXiong](https://github.com/LiuZhiXiong)
