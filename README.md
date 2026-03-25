# openclaw-custom-webhook

Custom HTTP Webhook channel plugin for [OpenClaw](https://github.com/openclaw/openclaw).  
通过 HTTP 接口收发消息，让任何系统都能接入 AI Agent。

## 一键安装

```bash
npx openclaw-custom-webhook install
```

自动完成：安装插件 → 修复 SDK 链接 → 配置密钥 → 重启 Gateway。

## 手动安装

```bash
# 1. 安装插件
openclaw plugins install openclaw-custom-webhook

# 2. 修复 SDK（全局安装用户需要）
npx openclaw-custom-webhook fix-sdk

# 3. 配置
npx openclaw-custom-webhook setup

# 4. 重启
openclaw gateway restart
```

## 发消息

```bash
curl -X POST http://localhost:18789/api/plugins/custom-webhook/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '{"senderId":"user1","text":"你好！"}'
```

**回复：**

```json
{
  "ok": true,
  "reply": "你好！有什么可以帮你的？",
  "timestamp": 1774290802998
}
```

## 发送图片

```bash
curl -X POST http://localhost:18789/api/plugins/custom-webhook/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '{
    "senderId": "user1",
    "text": "这张图片里是什么？",
    "attachments": [
      {"type": "image", "url": "https://example.com/photo.jpg"}
    ]
  }'
```

图片会自动下载并通过 OpenClaw 的 media understanding 管道传给 Agent 进行视觉分析。

## API 参考

### `POST /api/plugins/custom-webhook/webhook`

**Headers:**

| Header | 必填 | 说明 |
|--------|------|------|
| `Authorization` | ✅ | `Bearer <receiveSecret>` |
| `Content-Type` | ✅ | `application/json` |

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `senderId` | string | ✅ | 发送者标识 |
| `text` | string | ✅ | 消息内容 |
| `chatId` | string | ❌ | 会话 ID（默认等于 senderId） |
| `attachments` | array | ❌ | 附件列表（见下方） |
| `isGroup` | boolean | ❌ | 是否群聊（默认 false） |
| `messageId` | string | ❌ | 消息 ID（用于去重） |

**附件格式：**

```json
[
  {"type": "image", "url": "https://example.com/photo.jpg"},
  {"type": "file", "url": "https://example.com/doc.pdf", "name": "report.pdf"}
]
```

**成功响应 (200)：**

```json
{
  "ok": true,
  "reply": "Agent 的回复文本",
  "attachments": [{"type": "image", "url": "...", "text": "描述"}],
  "timestamp": 1774290802998
}
```

**错误响应：**
- `401` — 认证失败
- `500` — 内部处理错误

## 配置项

| 字段 | 说明 |
|------|------|
| `receiveSecret` | 接收消息的 Bearer Token（必填） |
| `pushUrl` | Agent 回复的推送地址（选填） |
| `pushSecret` | 推送时使用的 Bearer Token（选填） |

配置文件位置：`~/.openclaw/openclaw.json`

```json
{
  "channels": {
    "custom-webhook": {
      "accounts": {
        "default": {
          "receiveSecret": "your-secret-token",
          "pushUrl": "http://your-backend.com/receive",
          "pushSecret": "your-push-secret"
        }
      }
    }
  }
}
```

## 推送通知

配置了 `pushUrl` 后，Agent 回复会自动推送到你的后端：

```json
{
  "type": "reply",
  "to": "custom-webhook:chat1",
  "text": "Agent 的回复",
  "timestamp": 1774290802998
}
```

媒体回复推送格式：

```json
{
  "type": "media",
  "to": "custom-webhook:chat1",
  "text": "描述文字",
  "mediaUrl": "https://...",
  "timestamp": 1774290802998
}
```

## CLI 命令

```bash
npx openclaw-custom-webhook install    # 一键安装（推荐）
npx openclaw-custom-webhook setup      # 仅配置密钥
npx openclaw-custom-webhook test       # 发送测试消息
npx openclaw-custom-webhook fix-sdk    # 修复 plugin-sdk 链接
```

## 功能特性

- ✅ 一键安装，自动配置
- ✅ 完整 OpenClaw Agent 管道集成
- ✅ 多轮对话，上下文保持
- ✅ 图片/文件附件支持（Agent 视觉分析）
- ✅ Bearer Token 认证
- ✅ 异步推送通知
- ✅ 支持 npm / pnpm / nvm / fnm / volta / homebrew 等安装方式
- ✅ 兼容任何 HTTP 客户端（curl、Postman、你的应用）

## 故障排查

### 发消息返回 "not found"

1. **重启 Gateway**：安装插件后必须重启
   ```bash
   openclaw gateway restart
   ```

2. **确认插件加载**：检查启动日志是否有
   ```
   [custom-webhook] Registering HTTP route at /api/plugins/custom-webhook/webhook
   ```

3. **带调试日志启动**：
   ```bash
   OPENCLAW_PLUGIN_LOADER_DEBUG_STACKS=1 openclaw gateway run --force
   ```

### 找不到 plugin-sdk

```bash
# 方式一：一键修复
npx openclaw-custom-webhook fix-sdk

# 方式二：手动创建 symlink
mkdir -p ~/.openclaw/extensions/custom-webhook/node_modules
ln -sf $(npm root -g)/openclaw ~/.openclaw/extensions/custom-webhook/node_modules/openclaw
```

### 外部机器访问

Gateway 默认绑定 loopback，从外部访问需要：

```bash
openclaw gateway run --bind 0.0.0.0 --port 18789 --force
```

## Demo 后端

`examples/demo-backend/` 目录包含一个完整的 Express.js 参考实现，支持：

- `/send` — 发消息给 Agent（支持附件）
- `/receive` — 接收 Agent 推送回复
- `/history` — 查看消息历史

```bash
cd examples/demo-backend && npm install && npm start
```

## License

MIT
