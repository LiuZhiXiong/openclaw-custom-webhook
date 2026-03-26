/**
 * openclaw-custom-webhook — Plugin Entry Point
 *
 * This is a thin registration layer. All logic lives in:
 *   src/services/  — body parser, dedup, push, media, hmac, rate-limit, event-log
 *   src/openapi/   — OpenAPI 3.0.3 spec
 *   src/panel/     — Web Chat Panel HTML template
 *   src/channel.ts — ChannelPlugin definition
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { customWebhookPlugin } from "./src/channel.js";
import { setCustomWebhookRuntime, getCustomWebhookRuntime } from "./src/runtime.js";
import { VERSION } from "./src/version.js";
import { readBody, BodyTooLargeError } from "./src/services/body-parser.js";
import { isDuplicate } from "./src/services/dedup.js";
import { pushWithRetry } from "./src/services/push.js";
import { downloadAttachments, cleanupTempFiles } from "./src/services/media.js";
import { verifyHmac } from "./src/services/hmac.js";
import { isRateLimited, retryAfterSeconds } from "./src/services/rate-limit.js";
import { recordEvent, getEvents, clearEvents } from "./src/services/event-log.js";
import { getOpenApiSpec } from "./src/openapi/spec.js";
import { getPanelHtml } from "./src/panel/template.js";

// === Route Paths ===
const WEBHOOK_PATH = "/api/plugins/custom-webhook/webhook";
const HEALTH_PATH = "/api/plugins/custom-webhook/health";
const PANEL_PATH = "/api/plugins/custom-webhook/panel";
const OPENAPI_PATH = "/api/plugins/custom-webhook/openapi.json";
const EVENTS_PATH = "/api/plugins/custom-webhook/events";
const DOCS_PATH = "/api/plugins/custom-webhook/docs";

// === Swagger UI HTML ===
function getSwaggerHtml(specUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Custom Webhook — API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>body{margin:0;background:#1a1a2e}.swagger-ui .topbar{display:none}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>SwaggerUIBundle({url:"${specUrl}",dom_id:"#swagger-ui",deepLinking:true,presets:[SwaggerUIBundle.presets.apis,SwaggerUIBundle.SwaggerUIStandalonePreset],layout:"BaseLayout"})</script>
</body>
</html>`;
}

// === Plugin Definition ===
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
    const hmacSecret: string = defaultAcct.hmacSecret ?? "";
    const requestTimeoutMs: number = defaultAcct.requestTimeoutMs ?? 120_000;

    api.logger.info(`[custom-webhook] v${VERSION} registering routes`);

    // ─────────────────────────────────────────────────
    // GET /health
    // ─────────────────────────────────────────────────
    api.registerHttpRoute({
      path: HEALTH_PATH,
      auth: "plugin",
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok: true,
          plugin: "custom-webhook",
          version: VERSION,
          uptime: process.uptime(),
          timestamp: Date.now(),
        }));
      },
    });

    // ─────────────────────────────────────────────────
    // GET /panel
    // ─────────────────────────────────────────────────
    api.registerHttpRoute({
      path: PANEL_PATH,
      auth: "plugin",
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const host = `http://${req.headers.host ?? "localhost:18789"}`;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(getPanelHtml(`${host}${WEBHOOK_PATH}`));
      },
    });

    // ─────────────────────────────────────────────────
    // GET /openapi.json
    // ─────────────────────────────────────────────────
    api.registerHttpRoute({
      path: OPENAPI_PATH,
      auth: "plugin",
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const host = `http://${req.headers.host ?? "localhost:18789"}`;
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify(getOpenApiSpec(host), null, 2));
      },
    });

    // ─────────────────────────────────────────────────
    // GET /docs (Swagger UI)
    // ─────────────────────────────────────────────────
    api.registerHttpRoute({
      path: DOCS_PATH,
      auth: "plugin",
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const host = `http://${req.headers.host ?? "localhost:18789"}`;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(getSwaggerHtml(`${host}${OPENAPI_PATH}`));
      },
    });

    // ─────────────────────────────────────────────────
    // GET /events (debug event log)
    // ─────────────────────────────────────────────────
    api.registerHttpRoute({
      path: EVENTS_PATH,
      auth: "plugin",
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        // Support DELETE via query param ?clear=1
        const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
        if (url.searchParams.get("clear") === "1") {
          const count = clearEvents();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, cleared: count }));
          return;
        }
        const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);
        const events = getEvents(limit);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify({ total: events.length, events }));
      },
    });

    // ─────────────────────────────────────────────────
    // POST /webhook — Main message handler
    // ─────────────────────────────────────────────────
    api.registerHttpRoute({
      path: WEBHOOK_PATH,
      auth: "plugin",
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const startTime = Date.now();

        try {
          // 1. Read body (with size limit)
          let bodyStr: string;
          try {
            bodyStr = await readBody(req);
          } catch (err) {
            if (err instanceof BodyTooLargeError) {
              res.writeHead(413, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Request body too large (max 10MB)" }));
              recordEvent({ type: "error", status: 413, error: "body_too_large", timestamp: Date.now() });
              return;
            }
            throw err;
          }

          // 2. Verify Bearer token
          const authHeader = req.headers.authorization ?? "";
          const token = authHeader.replace(/^Bearer\s+/i, "");
          if (!receiveSecret || token !== receiveSecret) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized" }));
            recordEvent({ type: "error", status: 401, error: "unauthorized", timestamp: Date.now() });
            return;
          }

          // 3. HMAC signature verification (if configured)
          if (hmacSecret) {
            const sig = (req.headers["x-webhook-signature"] as string) ?? "";
            const ts = (req.headers["x-webhook-timestamp"] as string) ?? "";
            if (!sig || !ts || !verifyHmac(bodyStr, sig, ts, hmacSecret)) {
              res.writeHead(401, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Invalid HMAC signature or expired timestamp" }));
              recordEvent({ type: "error", status: 401, error: "hmac_invalid", timestamp: Date.now() });
              return;
            }
          }

          // 4. Parse body
          const body = JSON.parse(bodyStr);
          const senderId = body.senderId ?? body.sender_id ?? "webhook-user";
          const chatId = body.chatId ?? body.chat_id ?? senderId;
          const rawText = body.text ?? body.message ?? body.content ?? "";
          const isGroup = body.isGroup ?? body.is_group ?? false;
          const messageId = body.messageId ?? body.message_id ?? `wh-${Date.now()}`;
          const asyncMode = body.async === true;
          const streamMode = body.stream === true;

          // 5. Rate limiting
          if (isRateLimited(senderId)) {
            const retryAfter = retryAfterSeconds(senderId);
            res.writeHead(429, {
              "Content-Type": "application/json",
              "Retry-After": String(retryAfter),
            });
            res.end(JSON.stringify({ error: "Rate limit exceeded", retryAfter }));
            recordEvent({ type: "error", senderId, status: 429, error: "rate_limited", timestamp: Date.now() });
            return;
          }

          // 6. Dedup check
          if (isDuplicate(messageId)) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, deduplicated: true, messageId }));
            recordEvent({ type: "inbound", senderId, chatId, status: 200, latencyMs: Date.now() - startTime, timestamp: Date.now() });
            return;
          }

          // 7. Parse attachments
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
          recordEvent({ type: "inbound", senderId, chatId, timestamp: Date.now() });

          // 8. Async mode: return 202 immediately
          if (asyncMode) {
            if (!pushUrl) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "async mode requires pushUrl in config" }));
              return;
            }
            res.writeHead(202, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, async: true, messageId }));
            processMessage().catch((err) =>
              api.logger.error(`[custom-webhook] Async processing error: ${err}`)
            );
            return;
          }

          // 9. Stream mode or sync mode
          if (streamMode) {
            // SSE streaming
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "Access-Control-Allow-Origin": "*",
            });
            await processMessage(/* stream */ true, res);
          } else {
            // Sync mode with timeout
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("TIMEOUT")), requestTimeoutMs),
            );
            try {
              await Promise.race([processMessage(), timeoutPromise]);
            } catch (err) {
              if (String(err).includes("TIMEOUT") && !res.headersSent) {
                res.writeHead(504, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Gateway timeout", timeoutMs: requestTimeoutMs }));
                recordEvent({ type: "error", senderId, status: 504, error: "timeout", timestamp: Date.now() });
                return;
              }
              throw err;
            }
            return;
          }

          async function processMessage(isStreaming = false, sseRes?: ServerResponse) {
            const pluginRuntime = getCustomWebhookRuntime();

            // Record inbound activity
            pluginRuntime.channel.activity.record({
              channel: "custom-webhook",
              accountId: "default",
              direction: "inbound",
            });

            // Resolve agent route
            const route = pluginRuntime.channel.routing.resolveAgentRoute({
              cfg,
              channel: "custom-webhook",
              accountId: "default",
              peer: {
                kind: isGroup ? "group" : "direct",
                id: chatId,
              },
            });

            // Resolve envelope options
            const envelopeOptions = pluginRuntime.channel.reply.resolveEnvelopeFormatOptions(cfg);
            const fromAddress = `custom-webhook:${chatId}`;
            const toAddress = fromAddress;

            const envelope = pluginRuntime.channel.reply.formatInboundEnvelope({
              body: text,
              from: senderId,
              channel: "custom-webhook",
              envelope: envelopeOptions,
            });

            // Download image attachments to temp files
            const { mediaPaths, mediaUrls, mediaTypes } = await downloadAttachments(attachments, api.logger);

            // Finalize inbound context
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
              ...(mediaPaths.length > 0 ? {
                MediaPath: mediaPaths[0],
                MediaPaths: mediaPaths,
                MediaUrl: mediaUrls[0],
                MediaUrls: mediaUrls,
                MediaType: mediaTypes[0],
                MediaTypes: mediaTypes,
              } : {}),
            });

            // Dispatch to agent and collect reply
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
                  if (info.kind === "tool") return;

                  if (payload.mediaUrl) {
                    const ext = payload.mediaUrl.split(".").pop()?.toLowerCase() ?? "";
                    const type = ["jpg","jpeg","png","gif","webp","svg"].includes(ext) ? "image" : "file";
                    replyMedia.push({ type, url: payload.mediaUrl, text: payload.text });

                    if (isStreaming && sseRes) {
                      sseRes.write(`event: media\ndata: ${JSON.stringify({ type, url: payload.mediaUrl, text: payload.text })}\n\n`);
                    }
                  }
                  if (payload.text) {
                    replyChunks.push(payload.text);

                    if (isStreaming && sseRes) {
                      sseRes.write(`event: chunk\ndata: ${JSON.stringify({ text: payload.text })}\n\n`);
                    }
                  }
                },
              },
            });

            const agentReply = replyChunks.join("\n");

            // Cleanup temp media files
            cleanupTempFiles(mediaPaths);

            // Push agent reply to external service
            if (pushUrl) {
              await pushWithRetry(pushUrl, pushSecret, {
                type: "agent_reply",
                senderId,
                chatId,
                reply: agentReply,
                ...(replyMedia.length > 0 ? { attachments: replyMedia } : {}),
                timestamp: Date.now(),
              }, api.logger);
              recordEvent({ type: "push", senderId, chatId, timestamp: Date.now() });
            }

            // Record outbound activity
            pluginRuntime.channel.activity.record({
              channel: "custom-webhook",
              accountId: "default",
              direction: "outbound",
            });

            const latencyMs = Date.now() - startTime;
            recordEvent({ type: "outbound", senderId, chatId, status: 200, latencyMs, timestamp: Date.now() });

            if (isStreaming && sseRes) {
              // SSE: send done event and close
              sseRes.write(`event: done\ndata: ${JSON.stringify({ ok: true, timestamp: Date.now(), latencyMs })}\n\n`);
              sseRes.end();
            } else {
              // Sync: return JSON response
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  ok: true,
                  reply: agentReply,
                  ...(replyMedia.length > 0 ? { attachments: replyMedia } : {}),
                  timestamp: Date.now(),
                }),
              );
            }
          }
        } catch (err) {
          api.logger.error(`[custom-webhook] Handler error: ${err}`);
          recordEvent({ type: "error", status: 500, error: String(err), timestamp: Date.now() });
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
