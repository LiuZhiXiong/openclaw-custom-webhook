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
| `RECEIVE_SECRET` | `my_super_secret_receive_token` | 发往 OpenClaw 的 Bearer Token |
| `PUSH_SECRET` | `my_super_secret_push_token` | 接收 OpenClaw 推送的 Bearer Token |

## API

### `POST /send` — 发送消息给 OpenClaw

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

### `GET /history` — 查看消息历史

```bash
curl http://localhost:3005/history
```

### `GET /health` — 健康检查

```bash
curl http://localhost:3005/health
```

## 架构

```
你的后端 (localhost:3005)
  │
  ├─ POST /send ──────────→ OpenClaw Gateway ──→ AI Agent
  │                                                  │
  └─ POST /receive ←──────── pushUrl 推送 ←──────────┘
```
