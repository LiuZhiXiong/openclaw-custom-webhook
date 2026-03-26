中文 | [English](./README.md)

# 🦞 OpenClaw Custom Webhook

[![npm version](https://img.shields.io/npm/v/openclaw-custom-webhook.svg)](https://www.npmjs.com/package/openclaw-custom-webhook)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![OpenClaw: v2026.3+](https://img.shields.io/badge/OpenClaw-v2026.3+-orange.svg)](https://github.com/openclaw/openclaw)

**让任何 HTTP 客户端都能和 OpenClaw AI Agent 双向通信。** 发消息给 Agent、接收 Agent 的主动推送，无需额外 SDK。

```
              ┌──────────────────────────┐
              │   OpenClaw Agent (AI)    │
              └────────────┬─────────────┘
                           │
              ┌────────────┴─────────────┐
              │   Custom Webhook Plugin  │
              └──┬───────────────────┬───┘
                 │                   │
   ┌─────────────▼────────┐  ┌──────▼──────────────────┐
   │  📤 发送消息给 Agent  │  │  📥 接收 Agent 主动推送  │
   │  POST /webhook       │  │  Agent → 你的 pushUrl   │
   │  同步回复 / 异步202   │  │  HMAC 签名 + 自动重试   │
   └──────────────────────┘  └─────────────────────────┘
```

## 为什么需要它

OpenClaw 原生支持 Telegram、Discord、Slack 等渠道，但如果你要对接：

- 🏢 企业微信 / 钉钉机器人
- 📱 自研 App 后端
- 🏭 内部 SaaS 工具
- 🤖 IoT 设备
- ⚙️ CI/CD 流水线的 AI 能力

**Custom Webhook 就是万能适配器** —— 只要能发 HTTP 请求，就能接入你的 OpenClaw Agent，自动支持多轮对话。

---

## 快速开始

```bash
# 安装（自动配置 SDK、密钥、重启网关）
npx openclaw-custom-webhook install

# 打开测试面板
npx openclaw-custom-webhook open
```

或者直接发一条消息：

```bash
curl -X POST http://localhost:18789/api/plugins/custom-webhook/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 你的密钥" \
  -d '{"senderId": "user-1", "text": "你好！"}'
```

```json
{
  "ok": true,
  "reply": "你好！👋 有什么可以帮你的？",
  "timestamp": 1774463000000
}
```

---

## 核心特性

| 特性 | 说明 |
|------|------|
| **多轮对话** | 相同 `senderId` = 相同会话，Agent 自动记住上下文 |
| **同步 & 异步模式** | 等待回复，或立即返回 202、通过 pushUrl 回调接收结果 |
| **Web 测试面板** | 内置聊天 UI（`/panel`），支持暗色/亮色主题、密钥持久化、消息历史 |
| **幂等投递** | `messageId` 去重，5 分钟窗口内防止 Agent 重复处理 |
| **多模态输入** | 通过 `attachments[]` 发送图片/文件给 Agent |
| **可靠推送** | 异步回复自动重试 3 次（指数退避） |
| **速率限制** | 滑动窗口限流，默认 30 请求/分钟 |
| **HMAC 签名** | 推送回调使用 SHA-256 HMAC 签名，防篡改 |
| **健康检查 & 事件日志** | 实时健康状态 + 环形缓冲区事件日志 |
| **OpenAPI 3.0 规范** | 机器可读 spec，可直接导入 Postman 或 AI 工具 |

---

## CLI 命令

```bash
npx openclaw-custom-webhook [命令]
```

| 命令 | 说明 |
|------|------|
| `install` | 安装插件、配置 SDK 软链、设置密钥、重启网关 |
| `status` | 查看网关健康状态、端点、加载配置 |
| `open` | 在浏览器中打开 Web 测试面板 |
| `test` | 从终端发送一条测试消息 |
| `setup` | 交互式配置 `receiveSecret` 和 `pushUrl` |
| `fix-sdk` | 修复 npm 更新后的 `plugin-sdk` 软链 |
| `uninstall` | 移除插件并清理配置 |

---

## API 接口

> **基础地址**：`http://localhost:18789/api/plugins/custom-webhook`
>
> **认证**：`Authorization: Bearer <receiveSecret>`

### 发送消息

```
POST /webhook
```

#### 请求参数

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `senderId` | string | ✅ | 用户唯一标识。相同 ID = 相同会话 |
| `text` | string | ✅ | 消息文本 |
| `chatId` | string | — | 聊天/群组 ID（默认等于 `senderId`） |
| `messageId` | string | — | 用于幂等投递，不传则自动生成 |
| `async` | boolean | — | `true` 立即返回 202，回复通过 `pushUrl` 推送 |
| `isGroup` | boolean | — | `true` 表示来自群聊 |
| `attachments` | array | — | 附件列表（见下方格式） |

#### 附件格式

```json
{
  "attachments": [
    { "url": "https://example.com/photo.jpg", "type": "image", "name": "photo.jpg" },
    { "url": "https://example.com/doc.pdf", "type": "file", "name": "report.pdf" }
  ]
}
```

#### 同步响应 (200)

```json
{
  "ok": true,
  "reply": "Agent 的回复内容",
  "attachments": [
    { "type": "image", "url": "https://cdn.example.com/generated.png" }
  ],
  "timestamp": 1774463000000
}
```

#### 异步响应 (202)

```json
{ "ok": true, "async": true, "messageId": "wh-1774463000000" }
```

Agent 处理完毕后会 POST 到你配置的 `pushUrl`：

```json
{
  "type": "agent_reply",
  "senderId": "user-1",
  "reply": "这是你要的总结...",
  "timestamp": 1774463005000
}
```

### 系统端点

| 端点 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/panel` | GET | 否 | Web 聊天测试面板 |
| `/docs` | GET | 否 | Swagger UI 文档 |
| `/openapi.json` | GET | 否 | OpenAPI 3.0.3 规范 |
| `/health` | GET | 否 | 网关健康状态 + 运行时间 |
| `/events` | GET | 否 | 最近事件日志 |

---

## 多轮对话

插件自动维护会话。**相同 `senderId`** 的消息会路由到同一个 Agent 会话，Agent 记住之前的上下文：

```bash
# 第一条消息
curl -X POST .../webhook -H "Authorization: Bearer secret" \
  -d '{"senderId": "alice", "text": "我叫小明"}'
# → "你好小明！记住了 👋"

# 第二条消息（相同 senderId）
curl -X POST .../webhook -H "Authorization: Bearer secret" \
  -d '{"senderId": "alice", "text": "我叫什么名字？"}'
# → "你叫小明！"
```

不同的 `senderId` 会创建隔离的会话 -- 天然支持多租户。

---

## 接收 Agent 消息（推送回调）

除了"发消息 -> 等回复"的同步模式，你还可以让 Agent **主动推送消息到你的服务器**。这是与外部系统深度集成的核心能力。

### 工作流程

```
1. 你的应用发送消息 (async: true)     →  Webhook 返回 202
2. Agent 在后台处理                    →  你的应用无需等待
3. Agent 回复完成                      →  POST 到你配置的 pushUrl
4. 你的服务器接收回复                  →  转发给用户/写入数据库
```

### 推送载荷格式

```json
{
  "type": "agent_reply",
  "senderId": "user-1",
  "chatId": "user-1",
  "reply": "Agent 的回复内容...",
  "attachments": [
    { "type": "image", "url": "https://cdn.example.com/chart.png" }
  ],
  "timestamp": 1774463005000
}
```

### 服务端接收示例 (Node.js + Express)

```javascript
const crypto = require('crypto');
const express = require('express');
const app = express();

app.use(express.json());

app.post('/api/agent-callback', (req, res) => {
  // 1. 验证 HMAC 签名（防篡改）
  const signature = req.headers['x-signature'];
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.PUSH_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature !== expected) {
    return res.status(401).json({ error: 'invalid signature' });
  }

  // 2. 处理 Agent 回复
  const { senderId, reply, attachments } = req.body;
  console.log(`Agent replied to ${senderId}: ${reply}`);

  // 3. 转发到你的业务系统（企业微信、钉钉、App 推送等）
  forwardToUser(senderId, reply, attachments);

  res.json({ ok: true });
});

app.listen(3000);
```

### 服务端接收示例 (Python + Flask)

```python
import hmac, hashlib
from flask import Flask, request, jsonify

app = Flask(__name__)
PUSH_SECRET = "你的推送密钥"

@app.route('/api/agent-callback', methods=['POST'])
def agent_callback():
    # 1. 验证 HMAC 签名
    signature = request.headers.get('X-Signature', '')
    body = request.get_data(as_text=True)
    expected = 'sha256=' + hmac.new(
        PUSH_SECRET.encode(), body.encode(), hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(signature, expected):
        return jsonify(error='invalid signature'), 401

    # 2. 处理 Agent 回复
    data = request.json
    print(f"Agent replied to {data['senderId']}: {data['reply']}")

    return jsonify(ok=True)
```

### 推送可靠性保障

| 机制 | 说明 |
|------|------|
| **自动重试** | 推送失败自动重试 3 次（指数退避：1s, 2s, 4s） |
| **HMAC 签名** | 每次推送带 `X-Signature` 头，SHA-256 签名防篡改 |
| **超时控制** | 单次推送超时 10 秒 |
| **错误日志** | 推送失败记录到事件日志（`/events`） |

---

## 配置

插件配置存储在 `~/.openclaw/openclaw.json`：

```json
{
  "channels": {
    "custom-webhook": {
      "accounts": {
        "default": {
          "receiveSecret": "你的接收密钥",
          "pushUrl": "https://your-backend.com/api/webhook-callback",
          "pushSecret": "推送回调密钥"
        }
      }
    }
  }
}
```

| 配置项 | 说明 |
|--------|------|
| `receiveSecret` | 调用 webhook API 时需要携带的 Bearer Token |
| `pushUrl` | 异步模式下，Agent 回复推送到的目标地址 |
| `pushSecret` | 推送请求的 Authorization 头和 HMAC 签名密钥 |

---

## 安全机制

### 认证
所有 `/webhook` 请求必须携带有效的 Bearer Token（匹配 `receiveSecret`）。

### HMAC 签名验证（可选）

**OpenClaw 推送时永远带上签名头**（配置了 `pushSecret` 时），但**验不验是你自己决定的**：

| 策略 | 适用场景 |
|------|----------|
| 只验 Bearer Token | 内网部署、小项目、快速集成 |
| 验 HMAC 签名（推荐） | 公网暴露的 pushUrl、生产环境 |
| 两个都验 | 高安全要求 |
| 都不验 | 本地测试 |

推送请求固定带有：
```
Authorization: Bearer <pushSecret>
X-Signature: sha256=<HMAC-SHA256 摘要>
X-Timestamp: <毫秒时间戳>
```

> **注意**：X-Timestamp 是**推送那一刻**生成的，和 Agent 处理了多久无关。
> 因此即使 Agent 思考了 10 分钟，推送发出时时间戳依然是"刚刚"，5 分钟窗口不会误判。

**验证时必须用原始 raw body**（不能 re-stringify），否则签名会对不上：

```javascript
const crypto = require('crypto');
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); }
}));

app.post('/receive', (req, res) => {
  const signature = req.headers['x-signature'];
  const timestamp  = req.headers['x-timestamp'];

  // 时间戳重放保护（5 分钟窗口）
  if (Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000) {
    return res.status(401).json({ error: 'timestamp expired' });
  }

  // HMAC 验证（用 raw body，不要 JSON.stringify(req.body)）
  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.PUSH_SECRET)
    .update(`${timestamp}.${req.rawBody}`)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(401).json({ error: 'invalid signature' });
  }

  // 验证通过，处理 Agent 回复
  const { senderId, reply } = req.body;
  res.json({ ok: true });
});
```

### 速率限制
滑动窗口限流，默认 30 请求/分钟，超限返回 `429 Too Many Requests`。

### 请求大小
最大请求体：10 MB。

---

## 项目结构

```
~/.openclaw/extensions/custom-webhook/
├── index.ts              # 插件入口：路由、Swagger UI、OpenAPI 规范
├── src/
│   ├── panel/
│   │   └── template.ts   # Web 面板 HTML 模板（暗色/亮色主题）
│   └── services/
│       ├── hmac.ts        # HMAC-SHA256 推送签名
│       ├── rate-limiter.ts # 滑动窗口限流器
│       └── push.ts        # 可靠推送（指数退避重试）
├── openclaw.plugin.json   # 插件清单
└── package.json
```

---

## 集成示例

### Python

```python
import requests

resp = requests.post(
    "http://localhost:18789/api/plugins/custom-webhook/webhook",
    json={"senderId": "py-bot", "text": "你好！"},
    headers={"Authorization": "Bearer 你的密钥"}
)
print(resp.json()["reply"])
```

### Node.js

```javascript
const resp = await fetch("http://localhost:18789/api/plugins/custom-webhook/webhook", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer 你的密钥"
  },
  body: JSON.stringify({ senderId: "node-bot", text: "你好！" })
});
const { reply } = await resp.json();
```

### 企业微信机器人

```python
# 在你的企业微信消息处理函数中：
def on_message(msg):
    resp = requests.post(WEBHOOK_URL,
        json={"senderId": msg.from_user, "text": msg.content},
        headers={"Authorization": f"Bearer {SECRET}"}
    )
    return resp.json()["reply"]
```

---

## 常见问题

| 问题 | 解决方案 |
|------|----------|
| `Cannot find module 'openclaw/plugin-sdk'` | 运行 `npx openclaw-custom-webhook fix-sdk` |
| 网关未加载插件 | `openclaw gateway restart` 或检查 `openclaw channels status` |
| 401 Unauthorized | 检查 `~/.openclaw/openclaw.json` 中的 `receiveSecret` 是否匹配 |
| 429 Too Many Requests | 速率限制，等 60 秒或调整限流配置 |
| 面板显示 OFFLINE | 网关可能需要重启：`openclaw gateway restart` |

---

## 许可证

MIT © [LiuZhiXiong](https://github.com/LiuZhiXiong)
