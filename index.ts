import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { customWebhookPlugin } from "./src/channel.js";
import { setCustomWebhookRuntime } from "./src/runtime.js";
import { getCustomWebhookRuntime } from "./src/runtime.js";

const WEBHOOK_PATH = "/api/plugins/custom-webhook/webhook";

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
  id: "openclaw-custom-webhook",
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

          // 7. Push agent reply to external service
          if (pushUrl) {
            try {
              await fetch(pushUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(pushSecret ? { Authorization: `Bearer ${pushSecret}` } : {}),
                },
                body: JSON.stringify({
                  type: "agent_reply",
                  senderId,
                  chatId,
                  reply: agentReply,
                  ...(replyMedia.length > 0 ? { attachments: replyMedia } : {}),
                  timestamp: Date.now(),
                }),
              });
            } catch (err) {
              api.logger.warn(`[custom-webhook] Push error: ${err}`);
            }
          }

          // 8. Record outbound activity
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
        } catch (err) {
          api.logger.error(`[custom-webhook] Handler error: ${err}`);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal error", message: String(err) }));
        }
      },
    });
  },
};

export default plugin;

export { customWebhookPlugin } from "./src/channel.js";
export { setCustomWebhookRuntime } from "./src/runtime.js";
