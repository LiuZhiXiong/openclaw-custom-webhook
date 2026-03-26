# Demo Backend

一个简单的 Node.js 后端，演示如何与 OpenClaw Custom Webhook 插件交互。

## 快速开始

```bash
cd examples/demo-backend
npm install
npm start
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3005` | 服务端口 |
| `OPENCLAW_URL` | `http://localhost:18789` | OpenClaw Gateway 地址 |
| `RECEIVE_SECRET` | `my_super_secret_receive_token` | 发往 OpenClaw 的 Bearer Token（对应 openclaw.json 中的 `receiveSecret`） |
| `PUSH_SECRET` | `my_super_secret_push_token` | 接收 OpenClaw 推送的 Bearer Token（对应 openclaw.json 中的 `pushSecret`） |

## API

### `POST /send` — 发送消息给 OpenClaw

支持**同步**和**异步**两种模式。

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | string | 是* | 消息内容 |
| `senderId` | string | 否 | 发送者 ID，默认 `demo_user` |
| `chatId` | string | 否 | 会话 ID，默认 `demo_chat` |
| `async` | boolean | 否 | 异步模式，默认 `false` |
| `messageId` | string | 否 | 消息去重 ID |
| `attachments` | array | 否 | 图片/文件附件 |

> *`text` 和 `attachments` 至少提供一个

#### 同步模式（默认）

```bash
curl -X POST http://localhost:3005/send \
  -H "Content-Type: application/json" \
  -d '{"text":"你好！","senderId":"user1","chatId":"chat1"}'
```

**响应：**
```json
{
  "ok": true,
  "reply": "你好！我是你的 AI 助手",
  "timestamp": 1774290802998
}
```

#### 异步模式

Agent 立即返回 202，处理完成后通过 pushUrl 推送结果到 `/receive`：

```bash
curl -X POST http://localhost:3005/send \
  -H "Content-Type: application/json" \
  -d '{"text":"请总结这篇文章","senderId":"user1","async":true}'
```

**响应：**
```json
{
  "ok": true,
  "async": true,
  "messageId": "wh-1774463000000",
  "message": "Agent 正在处理中，结果将推送到 /receive"
}
```

#### 带图片附件

```bash
curl -X POST http://localhost:3005/send \
  -H "Content-Type: application/json" \
  -d '{"text":"这张图是什么?","senderId":"user1","attachments":[{"type":"image","url":"https://example.com/photo.jpg"}]}'
```

### `POST /receive` — 接收 Agent 回复（pushUrl 回调）

OpenClaw 自动调用此端点推送 Agent 回复。在 `openclaw.json` 中配置：

```json
{
  "channels": {
    "custom-webhook": {
      "accounts": {
        "default": {
          "pushUrl": "http://localhost:3005/receive",
          "pushSecret": "my_super_secret_push_token"
        }
      }
    }
  }
}
```

**推送 payload 格式：**
```json
{
  "type": "agent_reply",
  "senderId": "user1",
  "chatId": "chat1",
  "reply": "Agent 的回复内容",
  "attachments": [
    { "type": "image", "url": "https://cdn.example.com/chart.png" }
  ],
  "timestamp": 1774463000000
}
```

### `GET /history` — 查看消息历史

```bash
# 最近 50 条（默认）
curl http://localhost:3005/history

# 最近 10 条
curl http://localhost:3005/history?limit=10
```

### `DELETE /history` — 清空消息历史

```bash
curl -X DELETE http://localhost:3005/history
```

### `GET /health` — 健康检查

自动探测 OpenClaw Gateway 连通性：

```bash
curl http://localhost:3005/health
```

**响应：**
```json
{
  "ok": true,
  "uptime": 120,
  "messageCount": 5,
  "openclaw": "ok (v1.6.6, uptime: 3600s)"
}
```

## 架构

```
你的后端 (localhost:3005)
  │
  ├─ POST /send ──────────→ OpenClaw Gateway ──→ AI Agent
  │                           (sync: 直接返回)        │
  │                                                    │
  └─ POST /receive ←──────── pushUrl 推送 ←────────────┘
                               (async: 后台推送)
```

## 与 OpenClaw 配置对应关系

```
Demo Backend                  openclaw.json
──────────────────────────    ──────────────────────────────────
RECEIVE_SECRET (env)     →    channels.custom-webhook.accounts.default.receiveSecret
POST /receive (endpoint) →    channels.custom-webhook.accounts.default.pushUrl
PUSH_SECRET (env)        →    channels.custom-webhook.accounts.default.pushSecret
```
