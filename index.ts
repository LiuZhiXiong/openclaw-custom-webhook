import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { customWebhookPlugin } from "./src/channel.js";
import { setCustomWebhookRuntime } from "./src/runtime.js";
import { getCustomWebhookRuntime } from "./src/runtime.js";

const WEBHOOK_PATH = "/api/plugins/custom-webhook/webhook";
const HEALTH_PATH = "/api/plugins/custom-webhook/health";

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
