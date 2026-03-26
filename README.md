# 🦞 OpenClaw Custom Webhook

[![npm version](https://img.shields.io/npm/v/openclaw-custom-webhook.svg)](https://www.npmjs.com/package/openclaw-custom-webhook)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![OpenClaw: v2026.3+](https://img.shields.io/badge/OpenClaw-v2026.3+-orange.svg)](https://github.com/openclaw/openclaw)

A production-grade HTTP Webhook channel plugin for **OpenClaw AI Agents**. Connect any backend, bot, automation script, or frontend interface to your AI agents via standard REST APIs.

---

## ✨ Key Features

| Capability | Description |
|------------|-------------|
| 🖥 **Neo-Industrial Web Panel** | Built-in browser chat UI for instant Agent testing and debugging |
| ⚡️ **Async Processing** | Pass `async: true` to get 202 Accepted; results are pushed to your `pushUrl` |
| 🔄 **Idempotent Delivery** | `messageId` deduplication with 5-minute TTL to prevent duplicate agent replies |
| 🔁 **Reliable Push** | Auto-retries (3x exponential backoff) for push callbacks if your server drops connections |
| 🖼 **Multi-Modal Support** | Native image/file attachment processing directly into the Agent's vision pipeline |
| 📚 **Interactive OpenAPI** | Auto-generated standard OpenAPI 3.0.3 specification at `/openapi.json` |
| 🏥 **Health Monitoring** | Real-time gateway connectivity and plugin uptime via `/health` |

---

## 🚀 Quick Start

Install globally using `npx`. The installer will automatically configure the plugin, patch your OpenClaw SDK, set up authentication secrets, and restart the gateway:

```bash
npx openclaw-custom-webhook install
```

Once installed, simply open the Web Panel to start chatting with your Agent immediately:

```bash
npx openclaw-custom-webhook open
```
*(Or navigate to `http://localhost:18789/api/plugins/custom-webhook/panel`)*

---

## 💻 CLI Toolkit

Manage your plugin lifecycle directly from the terminal:

```bash
npx openclaw-custom-webhook [command]
```

| Command | Action |
|---------|--------|
| `install` | Install/Upgrade plugin, setup SDK, configure secrets, reboot gateway |
| `status` | View gateway health, active endpoints, and loaded configurations |
| `open` | Open the Web UI Panel in your default browser |
| `test` | Send a quick CLI-based test message to the Agent |
| `setup` | Interactively modify your auth keys (`receiveSecret` & `pushUrl`) |
| `fix-sdk` | Manually repair the `plugin-sdk` symlink after an NPM global update |
| `uninstall`| completely wipe the plugin directory and `openclaw.json` configurations |

---

## 📡 REST API Reference

> **Authentication**: All endpoints require a Bearer token matching your `receiveSecret` configured in `~/.openclaw/openclaw.json`.
> ```http
> Authorization: Bearer <your-secret>
> ```

### 1. Send Message (Sync)
**`POST /api/plugins/custom-webhook/webhook`**

Hold the connection open until the Agent replies.

```bash
curl -X POST http://localhost:18789/api/plugins/custom-webhook/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my_super_secret" \
  -d '{
    "senderId": "user123",
    "text": "What is the weather today?",
    "messageId": "unique-msg-001"
  }'
```

<details>
<summary><strong>View Response</strong></summary>

```json
{
  "ok": true,
  "reply": "I cannot check real-time weather, but I am here to help!",
  "timestamp": 1774463000000
}
```
</details>

### 2. Send Message (Async)
**`POST /api/plugins/custom-webhook/webhook`**

Return immediately. The Agent will process the message in the background and POST the result to your `pushUrl`.

```bash
curl -X POST http://localhost:18789/api/plugins/custom-webhook/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my_super_secret" \
  -d '{
    "senderId": "user123",
    "text": "Summarize this 50-page document.",
    "async": true
  }'
```

<details>
<summary><strong>View Response</strong></summary>

```json
{
  "ok": true,
  "async": true,
  "messageId": "wh-1774463000000"
}
```
</details>

### 3. Agent Push Callback (Your Server)
**`POST <your-pushUrl>`**

If you use Async mode, OpenClaw will POST this payload to your backend.

<details>
<summary><strong>View Payload Format</strong></summary>

```json
{
  "type": "agent_reply",
  "senderId": "user123",
  "chatId": "user123",
  "reply": "Here is the summary you requested...",
  "attachments": [
    { "type": "image", "url": "https://cdn.example.com/generated-chart.png" }
  ],
  "timestamp": 1774463005000
}
```
</details>

### 4. System Endpoints

- **Web Panel**: `GET /api/plugins/custom-webhook/panel`
- **OpenAPI 3.0**: `GET /api/plugins/custom-webhook/openapi.json`
- **Health Check**: `GET /api/plugins/custom-webhook/health`

---

## 🛠 Examples & Demos

We provide a **fully functional Node.js Demo Backend** that demonstrates how to implement both Sync and Async modes, handle Push callbacks, paginate history, and monitor connection health.

👉 [View Demo Backend Implementation (examples/demo-backend)](./examples/demo-backend/README.md)

---

## ⚙️ Configuration Reference

The plugin stores its configuration in your global OpenClaw settings `~/.openclaw/openclaw.json`. 

```json
{
  "channels": {
    "custom-webhook": {
      "accounts": {
        "default": {
          "receiveSecret": "YOUR_BEARER_TOKEN_HERE",
          "pushUrl": "https://your-backend.com/api/receive",
          "pushSecret": "TOKEN_YOUR_BACKEND_EXPECTS"
        }
      }
    }
  }
}
```

- `receiveSecret`: The token your system must send to OpenClaw.
- `pushUrl`: Where OpenClaw should POST async replies.
- `pushSecret`: The token OpenClaw will send to your server in the `Authorization` header.

## 📄 License

MIT © [LiuZhiXiong](https://github.com/LiuZhiXiong)
