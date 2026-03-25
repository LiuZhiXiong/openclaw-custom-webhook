# 🦞 openclaw-custom-webhook

Custom HTTP Webhook channel plugin for [OpenClaw](https://github.com/openclaw/openclaw) — connect any HTTP client, bot, or automation to AI agents.

[![npm version](https://img.shields.io/npm/v/openclaw-custom-webhook.svg)](https://www.npmjs.com/package/openclaw-custom-webhook)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🖥 **Web 测试面板** | 内置深色主题聊天 UI，浏览器直接测试 Agent |
| 💬 **消息历史** | localStorage 持久化，刷新页面不丢失 |
| 📋 **OpenAPI 文档** | 自动生成 3.0.3 标准 API 文档 |
| ⚡ **异步模式** | `async: true` 返回 202，后台处理并推送结果 |
| 🔄 **消息去重** | 5 分钟 TTL 缓存，防重复消息 |
| 🔁 **推送重试** | 3 次指数退避重试（1s → 2s → 4s） |
| 🖼 **多媒体支持** | 图片/文件自动下载 → Agent 视觉管道 |
| 🏥 **健康检查** | `/health` 端点实时监控 |
| 🗑 **一键卸载** | `uninstall` 命令清理全部配置和文件 |

## 🚀 Quick Start

```bash
npx openclaw-custom-webhook install
```

一键完成：安装插件 → 修复 SDK → 配置密钥 → 重启 Gateway

安装完成后，打开浏览器访问：

```
http://localhost:18789/api/plugins/custom-webhook/panel
```

## 📡 API Endpoints

| 端点 | 说明 |
|------|------|
| `POST /api/plugins/custom-webhook/webhook` | 发送消息给 Agent |
| `GET /api/plugins/custom-webhook/panel` | Web 聊天测试面板 |
| `GET /api/plugins/custom-webhook/openapi.json` | OpenAPI 3.0 文档 |
| `GET /api/plugins/custom-webhook/health` | 健康检查 |

### 发送消息

```bash
curl -X POST http://localhost:18789/api/plugins/custom-webhook/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SECRET" \
  -d '{
    "senderId": "user1",
    "chatId": "user1",
    "text": "你好，请介绍一下自己"
  }'
```

### 响应示例

```json
{
  "ok": true,
  "reply": "你好！我是 AI 助手...",
  "timestamp": 1711234567890
}
```

### 异步模式

```bash
curl -X POST http://localhost:18789/api/plugins/custom-webhook/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SECRET" \
  -d '{
    "senderId": "user1",
    "text": "分析这份文档",
    "async": true
  }'
```

返回 `202 Accepted`，Agent 处理完后推送到 `pushUrl`。

### 带附件消息

```json
{
  "senderId": "user1",
  "text": "这张图片是什么？",
  "attachments": [
    { "type": "image", "url": "https://example.com/photo.jpg" }
  ]
}
```

## 🎛 CLI Commands

```bash
npx openclaw-custom-webhook [command]
```

| 分类 | 命令 | 说明 |
|------|------|------|
| **安装** | `install` | 一键安装（插件 + SDK + 配置 + 重启） |
| | `uninstall` | 完整卸载（目录 + 配置全清） |
| | `fix-sdk` | 修复 plugin-sdk symlink |
| **配置** | `setup` | 交互式配置密钥 |
| | `status` | 查看插件状态、配置和端点 |
| **使用** | `test` | 发送测试消息 |
| | `open` | 在浏览器打开 Web 面板 |

## ⚙️ Configuration

配置存储在 `~/.openclaw/openclaw.json`：

```json
{
  "plugins": {
    "allow": ["custom-webhook"],
    "entries": {
      "custom-webhook": { "enabled": true }
    }
  },
  "channels": {
    "custom-webhook": {
      "accounts": {
        "default": {
          "receiveSecret": "your-secret-key",
          "pushUrl": "https://your-server.com/webhook",
          "pushSecret": "push-auth-token"
        }
      }
    }
  }
}
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `receiveSecret` | 是 | Bearer token，用于验证入站请求 |
| `pushUrl` | 否 | Agent 回复推送地址（异步模式必填） |
| `pushSecret` | 否 | 推送请求的 Authorization header |

## 🖥 Web 测试面板

面板地址：`http://localhost:18789/api/plugins/custom-webhook/panel`

**特性：**
- 🌑 深色玻璃拟态 UI
- 💾 聊天历史浏览器端持久化（最近 200 条）
- 🟢 实时 Gateway 健康状态
- ⚙️ Secret / Sender / Async 配置
- 🗑 一键清空聊天
- 📱 响应式设计

**快捷打开：**

```bash
npx openclaw-custom-webhook open
```

## 🔧 Troubleshooting

### 插件 ID 不匹配警告

```
plugin id mismatch (manifest uses "custom-webhook", entry hints "openclaw-custom-webhook")
```

这是无害警告，不影响功能。

### Gateway 须绑定外网

如需外部访问，启动 Gateway 时指定：

```bash
openclaw gateway run --bind 0.0.0.0 --port 18789
```

### SDK 链接问题

```bash
npx openclaw-custom-webhook fix-sdk
```

### 完整卸载

```bash
npx openclaw-custom-webhook uninstall
```

## 📝 Changelog

### v1.6.0
- 🎨 全新 glassmorphism Web 面板 UI
- 💾 localStorage 消息历史持久化
- 🗑 清空聊天 + Secret 记忆功能
- 📊 消息计数 + 格式化运行时间
- 📤 SVG 发送按钮 + 响应式设计

### v1.5.2
- ➕ `open` 命令打开 Web 面板
- ➕ `status` 命令查看插件状态
- ➕ `uninstall` 命令完整卸载
- 🎨 安装完成提示显示所有端点 URL

### v1.5.0
- 🖥 Web 测试面板 + OpenAPI 文档端点

### v1.4.0
- ⚡ 异步处理模式
- 🔄 消息去重
- 🔁 推送重试
- 🏥 健康检查端点
- 🖼 多媒体视觉管道 + 临时文件清理

## 📄 License

MIT
