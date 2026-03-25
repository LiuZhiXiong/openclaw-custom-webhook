import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { customWebhookPlugin } from "./src/channel.js";
import { setCustomWebhookRuntime } from "./src/runtime.js";
import { getCustomWebhookRuntime } from "./src/runtime.js";

const WEBHOOK_PATH = "/api/plugins/custom-webhook/webhook";
const HEALTH_PATH = "/api/plugins/custom-webhook/health";
const PANEL_PATH = "/api/plugins/custom-webhook/panel";
const OPENAPI_PATH = "/api/plugins/custom-webhook/openapi.json";

// === OpenAPI Spec ===
function getOpenApiSpec(host: string) {
  return {
    openapi: "3.0.3",
    info: {
      title: "Custom Webhook - OpenClaw Plugin",
      description: "HTTP Webhook channel plugin for OpenClaw AI agents. Send messages, images, and files to AI agents and receive intelligent replies.",
      version: "1.5.0",
      contact: { url: "https://github.com/LiuZhiXiong/openclaw-custom-webhook" },
    },
    servers: [{ url: host, description: "Current gateway" }],
    paths: {
      [WEBHOOK_PATH]: {
        post: {
          summary: "Send message to Agent",
          operationId: "sendMessage",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["senderId", "text"],
                  properties: {
                    senderId: { type: "string", description: "Unique sender identifier" },
                    text: { type: "string", description: "Message content" },
                    chatId: { type: "string", description: "Conversation ID (defaults to senderId)" },
                    async: { type: "boolean", description: "Return 202 immediately, push result via pushUrl" },
                    messageId: { type: "string", description: "Message ID for deduplication" },
                    isGroup: { type: "boolean", description: "Whether this is a group chat" },
                    attachments: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          type: { type: "string", enum: ["image", "file"] },
                          url: { type: "string", format: "uri" },
                          name: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Agent reply (sync mode)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      reply: { type: "string" },
                      attachments: { type: "array" },
                      timestamp: { type: "number" },
                    },
                  },
                },
              },
            },
            "202": { description: "Accepted (async mode)" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      [HEALTH_PATH]: {
        get: {
          summary: "Health check",
          operationId: "healthCheck",
          responses: {
            "200": {
              description: "Plugin health status",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      plugin: { type: "string" },
                      version: { type: "string" },
                      uptime: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
  };
}

// === Web Chat Panel HTML ===
function getPanelHtml(webhookUrl: string) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Custom Webhook Tester</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#0a0f1e;--surface:#111827;--surface2:#1e293b;--border:#1e3a5f;--text:#e2e8f0;--text2:#94a3b8;--cyan:#00d4ff;--cyan2:#0891b2;--blue:#3b82f6;--green:#22c55e;--red:#ef4444;--font:'Inter',system-ui,sans-serif}
body{font-family:var(--font);background:var(--bg);color:var(--text);height:100vh;display:flex;flex-direction:column}
header{background:var(--surface);border-bottom:1px solid var(--border);padding:12px 20px;display:flex;align-items:center;gap:12px;flex-shrink:0}
header h1{font-size:16px;font-weight:600;background:linear-gradient(135deg,var(--cyan),var(--blue));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.status{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 6px var(--green)}
.status.offline{background:var(--red);box-shadow:0 0 6px var(--red)}
header .spacer{flex:1}
header .links{display:flex;gap:8px}
header .links a{color:var(--text2);text-decoration:none;font-size:12px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;transition:all .2s}
header .links a:hover{color:var(--cyan);border-color:var(--cyan)}
.config-bar{background:var(--surface);border-bottom:1px solid var(--border);padding:8px 20px;display:flex;gap:8px;align-items:center;flex-shrink:0;flex-wrap:wrap}
.config-bar label{font-size:12px;color:var(--text2)}
.config-bar input,.config-bar select{font-family:var(--font);font-size:12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:4px 8px;color:var(--text);outline:none;transition:border-color .2s}
.config-bar input:focus{border-color:var(--cyan)}
.config-bar input.secret{width:200px}
.config-bar input.sender{width:100px}
.config-bar .toggle{display:flex;align-items:center;gap:4px}
.config-bar .toggle input[type=checkbox]{accent-color:var(--cyan)}
.messages{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:12px}
.msg{max-width:75%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.5;animation:fadeIn .3s ease;white-space:pre-wrap;word-break:break-word}
.msg.user{align-self:flex-end;background:linear-gradient(135deg,var(--blue),var(--cyan2));color:#fff;border-bottom-right-radius:4px}
.msg.agent{align-self:flex-start;background:var(--surface2);border:1px solid var(--border);border-bottom-left-radius:4px}
.msg.system{align-self:center;background:transparent;color:var(--text2);font-size:12px;padding:4px 12px}
.msg.error{align-self:center;background:#3b1111;color:var(--red);font-size:12px;border:1px solid #5c1c1c;border-radius:8px}
.msg .meta{font-size:10px;color:var(--text2);margin-top:4px}
.msg.agent .meta{color:var(--text2)}
.msg.user .meta{color:rgba(255,255,255,.6)}
.typing{align-self:flex-start;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:12px;border-bottom-left-radius:4px}
.typing span{display:inline-block;width:6px;height:6px;background:var(--text2);border-radius:50%;animation:bounce .6s infinite alternate;margin:0 2px}
.typing span:nth-child(2){animation-delay:.2s}
.typing span:nth-child(3){animation-delay:.4s}
@keyframes bounce{to{transform:translateY(-6px);opacity:.4}}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.input-bar{background:var(--surface);border-top:1px solid var(--border);padding:12px 20px;display:flex;gap:8px;flex-shrink:0}
.input-bar textarea{flex:1;font-family:var(--font);font-size:14px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px 14px;color:var(--text);outline:none;resize:none;height:42px;max-height:120px;transition:border-color .2s}
.input-bar textarea:focus{border-color:var(--cyan)}
.input-bar button{width:42px;height:42px;border-radius:10px;border:none;background:linear-gradient(135deg,var(--cyan),var(--blue));color:#fff;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;transition:transform .15s,opacity .2s}
.input-bar button:hover{transform:scale(1.05)}
.input-bar button:active{transform:scale(.95)}
.input-bar button:disabled{opacity:.5;cursor:not-allowed}
</style>
</head>
<body>
<header>
  <div class="status" id="status"></div>
  <h1>🦞 Custom Webhook Tester</h1>
  <div class="spacer"></div>
  <div class="links">
    <a href="${OPENAPI_PATH}" target="_blank">OpenAPI</a>
    <a href="${HEALTH_PATH}" target="_blank">Health</a>
    <a href="https://github.com/LiuZhiXiong/openclaw-custom-webhook" target="_blank">GitHub</a>
  </div>
</header>
<div class="config-bar">
  <label>Secret:</label>
  <input type="password" class="secret" id="secret" placeholder="Bearer token" value="">
  <label>Sender:</label>
  <input type="text" class="sender" id="sender" placeholder="user1" value="panel-user">
  <div class="toggle"><input type="checkbox" id="async"><label for="async">Async</label></div>
</div>
<div class="messages" id="messages">
  <div class="msg system">👋 输入 Bearer token 并发送消息测试 Agent</div>
</div>
<div class="input-bar">
  <textarea id="input" placeholder="输入消息... (Shift+Enter 换行)" rows="1"></textarea>
  <button id="send" title="发送">▶</button>
</div>
<script>
const webhookUrl = "${webhookUrl}";
const msgs = document.getElementById("messages");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const secretInput = document.getElementById("secret");
const senderInput = document.getElementById("sender");
const asyncCheck = document.getElementById("async");
const statusDot = document.getElementById("status");

// Auto-resize textarea
input.addEventListener("input", () => {
  input.style.height = "42px";
  input.style.height = Math.min(input.scrollHeight, 120) + "px";
});

// Enter to send
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
});

sendBtn.addEventListener("click", send);

// Check health
async function checkHealth() {
  try {
    const r = await fetch("${HEALTH_PATH}");
    statusDot.className = r.ok ? "status" : "status offline";
  } catch { statusDot.className = "status offline"; }
}
checkHealth(); setInterval(checkHealth, 15000);

function addMsg(text, type, meta) {
  const d = document.createElement("div");
  d.className = "msg " + type;
  d.textContent = text;
  if (meta) { const m = document.createElement("div"); m.className = "meta"; m.textContent = meta; d.appendChild(m); }
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  return d;
}

function addTyping() {
  const d = document.createElement("div");
  d.className = "typing"; d.id = "typing";
  d.innerHTML = "<span></span><span></span><span></span>";
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
}
function removeTyping() { const t = document.getElementById("typing"); if (t) t.remove(); }

function time() { return new Date().toLocaleTimeString(); }

async function send() {
  const text = input.value.trim();
  const secret = secretInput.value.trim();
  if (!text) return;
  if (!secret) { addMsg("请先输入 Bearer token", "error"); return; }

  addMsg(text, "user", time());
  input.value = ""; input.style.height = "42px";
  sendBtn.disabled = true;
  addTyping();

  try {
    const body = {
      senderId: senderInput.value || "panel-user",
      chatId: senderInput.value || "panel-user",
      text,
    };
    if (asyncCheck.checked) body.async = true;

    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + secret },
      body: JSON.stringify(body),
    });
    removeTyping();
    const data = await r.json();

    if (r.status === 202) {
      addMsg("⏳ 已接受 (async)，等待推送结果...", "system");
    } else if (r.ok && data.reply) {
      addMsg(data.reply, "agent", time() + (data.attachments?.length ? " · " + data.attachments.length + " 附件" : ""));
    } else {
      addMsg(JSON.stringify(data), "error");
    }
  } catch (e) {
    removeTyping();
    addMsg("连接失败: " + e.message, "error");
  }
  sendBtn.disabled = false;
  input.focus();
}
</script>
</body>
</html>`;
}

// Message dedup: keep recent IDs for 5 minutes
const recentMessageIds = new Map<string, number>();
const DEDUP_TTL_MS = 5 * 60 * 1000;
function isDuplicate(id: string): boolean {
  const now = Date.now();
  // Cleanup old entries
  for (const [k, t] of recentMessageIds) {
    if (now - t > DEDUP_TTL_MS) recentMessageIds.delete(k);
  }
  if (recentMessageIds.has(id)) return true;
  recentMessageIds.set(id, now);
  return false;
}

// Push with retry (3 attempts, exponential backoff)
async function pushWithRetry(
  url: string, secret: string, payload: Record<string, unknown>,
  logger: { warn: (msg: string) => void; info: (msg: string) => void },
): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        logger.info(`[custom-webhook] Push success (attempt ${attempt})`);
        return;
      }
      logger.warn(`[custom-webhook] Push HTTP ${resp.status} (attempt ${attempt}/${maxAttempts})`);
    } catch (err) {
      logger.warn(`[custom-webhook] Push error (attempt ${attempt}/${maxAttempts}): ${err}`);
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
  }
  logger.warn(`[custom-webhook] Push failed after ${maxAttempts} attempts`);
}

// Cleanup temp files
function cleanupTempFiles(paths: string[]): void {
  if (paths.length === 0) return;
  import("node:fs").then((fs) => {
    for (const p of paths) {
      try { fs.unlinkSync(p); } catch {}
    }
  }).catch(() => {});
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const plugin = {
  id: "custom-webhook",
  name: "Custom Webhook",
  description: "Custom HTTP Webhook channel plugin for receiving and sending messages via HTTP",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setCustomWebhookRuntime(api.runtime);
    api.registerChannel({ plugin: customWebhookPlugin });

    // Read config
    const cfg = api.config;
    const section = (cfg.channels as any)?.["custom-webhook"] ?? {};
    const accounts = section.accounts ?? {};
    const defaultAcct = accounts["default"] ?? section;
    const receiveSecret: string = defaultAcct.receiveSecret ?? "";
    const pushUrl: string = defaultAcct.pushUrl ?? "";
    const pushSecret: string = defaultAcct.pushSecret ?? "";

    api.logger.info(`[custom-webhook] Registering HTTP route at ${WEBHOOK_PATH}`);

    // Health endpoint
    api.registerHttpRoute({
      path: HEALTH_PATH,
      auth: "none",
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok: true,
          plugin: "custom-webhook",
          version: "1.4.0",
          uptime: process.uptime(),
          timestamp: Date.now(),
        }));
      },
    });

    // Web Chat Panel
    api.registerHttpRoute({
      path: PANEL_PATH,
      auth: "none",
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const host = `http://${req.headers.host ?? "localhost:18789"}`;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(getPanelHtml(`${host}${WEBHOOK_PATH}`));
      },
    });

    // OpenAPI Spec
    api.registerHttpRoute({
      path: OPENAPI_PATH,
      auth: "none",
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const host = `http://${req.headers.host ?? "localhost:18789"}`;
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify(getOpenApiSpec(host), null, 2));
      },
    });

    api.registerHttpRoute({
      path: WEBHOOK_PATH,
      auth: "plugin",
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          // Verify authorization
          const authHeader = req.headers.authorization ?? "";
          const token = authHeader.replace(/^Bearer\s+/i, "");
          if (!receiveSecret || token !== receiveSecret) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized" }));
            return;
          }

          const bodyStr = await readBody(req);
          const body = JSON.parse(bodyStr);

          const senderId = body.senderId ?? body.sender_id ?? "webhook-user";
          const chatId = body.chatId ?? body.chat_id ?? senderId;
          const rawText = body.text ?? body.message ?? body.content ?? "";
          const isGroup = body.isGroup ?? body.is_group ?? false;
          const messageId = body.messageId ?? body.message_id ?? `wh-${Date.now()}`;
          const asyncMode = body.async === true;

          // Dedup check
          if (isDuplicate(messageId)) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, deduplicated: true, messageId }));
            return;
          }

          // Parse attachments: [{type: "image", url: "..."}, {type: "file", url: "...", name: "..."}]
          const attachments: Array<{type?: string; url: string; name?: string}> =
            Array.isArray(body.attachments) ? body.attachments : [];

          // Build text with embedded media for the Agent
          let text = rawText;
          if (attachments.length > 0) {
            const mediaParts = attachments.map((a) => {
              const t = a.type ?? "file";
              if (t === "image") return `![image](${a.url})`;
              return `[${a.name ?? "file"}](${a.url})`;
            });
            text = text ? `${text}\n\n${mediaParts.join("\n")}` : mediaParts.join("\n");
          }

          api.logger.info(`[custom-webhook] Received from ${senderId}: ${text.slice(0, 100)}`);

          // Async mode: return 202 immediately, process in background
          if (asyncMode) {
            if (!pushUrl) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "async mode requires pushUrl in config" }));
              return;
            }
            res.writeHead(202, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, async: true, messageId }));
            // Continue processing in background (no await)
            processMessage().catch((err) =>
              api.logger.error(`[custom-webhook] Async processing error: ${err}`)
            );
            return;
          }

          await processMessage();
          return;

          async function processMessage() {

          // Route message into OpenClaw agent pipeline (like qqbot/feishu)
          const pluginRuntime = getCustomWebhookRuntime();

          // 1. Record activity
          pluginRuntime.channel.activity.record({
            channel: "custom-webhook",
            accountId: "default",
            direction: "inbound",
          });

          // 2. Resolve agent route
          const route = pluginRuntime.channel.routing.resolveAgentRoute({
            cfg,
            channel: "custom-webhook",
            accountId: "default",
            peer: {
              kind: isGroup ? "group" : "direct",
              id: chatId,
            },
          });

          // 3. Resolve envelope options
          const envelopeOptions = pluginRuntime.channel.reply.resolveEnvelopeFormatOptions(cfg);

          // 4. Format inbound envelope
          const fromAddress = `custom-webhook:${chatId}`;
          const toAddress = fromAddress;

          const envelope = pluginRuntime.channel.reply.formatInboundEnvelope({
            body: text,
            from: senderId,
            channel: "custom-webhook",
            envelope: envelopeOptions,
          });

          // 5. Finalize inbound context
          // Download images to temp files for OpenClaw's vision pipeline
          const imageAttachments = attachments.filter(
            (a) => (a.type ?? "file") === "image" && a.url,
          );
          const mediaPaths: string[] = [];
          const mediaUrls: string[] = [];
          const mediaTypes: string[] = [];

          if (imageAttachments.length > 0) {
            const os = await import("node:os");
            const fs = await import("node:fs");
            const path = await import("node:path");

            for (const attachment of imageAttachments) {
              try {
                const resp = await fetch(attachment.url);
                if (!resp.ok) {
                  api.logger.warn(`[custom-webhook] Failed to download ${attachment.url}: ${resp.status}`);
                  continue;
                }
                const contentType = resp.headers.get("content-type") ?? "image/jpeg";
                const extMap: Record<string, string> = {
                  "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif",
                  "image/webp": ".webp", "image/svg+xml": ".svg",
                };
                const ext = extMap[contentType] ?? ".jpg";
                const tmpFile = path.join(os.tmpdir(), `webhook-media-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
                const buffer = Buffer.from(await resp.arrayBuffer());
                fs.writeFileSync(tmpFile, buffer);
                mediaPaths.push(tmpFile);
                mediaUrls.push(attachment.url);
                mediaTypes.push(contentType);
                api.logger.info(`[custom-webhook] Downloaded ${attachment.url} -> ${tmpFile} (${buffer.length} bytes)`);
              } catch (err) {
                api.logger.warn(`[custom-webhook] Download error for ${attachment.url}: ${err}`);
              }
            }
          }

          const ctxPayload = pluginRuntime.channel.reply.finalizeInboundContext({
            Body: envelope ?? rawText,
            BodyForAgent: rawText,
            RawBody: rawText,
            CommandBody: rawText,
            From: fromAddress,
            To: toAddress,
            SessionKey: route.sessionKey,
            AccountId: route.accountId,
            ChatType: isGroup ? "group" : "direct",
            SenderId: senderId,
            Provider: "custom-webhook",
            Surface: "custom-webhook",
            MessageSid: messageId,
            Timestamp: Date.now(),
            OriginatingChannel: "custom-webhook",
            OriginatingTo: toAddress,
            CommandAuthorized: true,
            // Media fields for Agent vision pipeline
            ...(mediaPaths.length > 0 ? {
              MediaPath: mediaPaths[0],
              MediaPaths: mediaPaths,
              MediaUrl: mediaUrls[0],
              MediaUrls: mediaUrls,
              MediaType: mediaTypes[0],
              MediaTypes: mediaTypes,
            } : {}),
          });

          // 6. Dispatch to agent and collect reply
          const messagesConfig = pluginRuntime.channel.reply.resolveEffectiveMessagesConfig(
            cfg,
            route.agentId,
          );
          const replyChunks: string[] = [];
          const replyMedia: Array<{type: string; url: string; text?: string}> = [];

          await pluginRuntime.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
            ctx: ctxPayload,
            cfg,
            dispatcherOptions: {
              responsePrefix: messagesConfig.responsePrefix,
              deliver: async (payload: { text?: string; mediaUrl?: string }, info: { kind: string }) => {
                if (info.kind === "tool") return; // Skip intermediate tool results
                if (payload.mediaUrl) {
                  const ext = payload.mediaUrl.split(".").pop()?.toLowerCase() ?? "";
                  const type = ["jpg","jpeg","png","gif","webp","svg"].includes(ext) ? "image" : "file";
                  replyMedia.push({ type, url: payload.mediaUrl, text: payload.text });
                  api.logger.info(`[custom-webhook] Agent media: ${type} ${payload.mediaUrl}`);
                }
                if (payload.text) {
                  replyChunks.push(payload.text);
                  api.logger.info(`[custom-webhook] Agent chunk: ${payload.text.slice(0, 100)}`);
                }
              },
            },
          });

          const agentReply = replyChunks.join("\n");

          // 7. Cleanup temp media files
          cleanupTempFiles(mediaPaths);

          // 8. Push agent reply to external service (with retry)
          if (pushUrl) {
            await pushWithRetry(pushUrl, pushSecret, {
              type: "agent_reply",
              senderId,
              chatId,
              reply: agentReply,
              ...(replyMedia.length > 0 ? { attachments: replyMedia } : {}),
              timestamp: Date.now(),
            }, api.logger);
          }

          // 9. Record outbound activity
          pluginRuntime.channel.activity.record({
            channel: "custom-webhook",
            accountId: "default",
            direction: "outbound",
          });

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: true,
              reply: agentReply,
              ...(replyMedia.length > 0 ? { attachments: replyMedia } : {}),
              timestamp: Date.now(),
            }),
          );
          } // end processMessage
        } catch (err) {
          api.logger.error(`[custom-webhook] Handler error: ${err}`);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal error", message: String(err) }));
          }
        }
      },
    });
  },
};

export default plugin;

export { customWebhookPlugin } from "./src/channel.js";
export { setCustomWebhookRuntime } from "./src/runtime.js";
