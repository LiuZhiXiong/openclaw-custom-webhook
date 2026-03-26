import { VERSION } from "../version.js";

const WEBHOOK_PATH = "/api/plugins/custom-webhook/webhook";
const HEALTH_PATH = "/api/plugins/custom-webhook/health";

export function getOpenApiSpec(host: string) {
  return {
    openapi: "3.0.3",
    info: {
      title: "Custom Webhook - OpenClaw Plugin",
      description:
        "HTTP Webhook channel plugin for OpenClaw AI agents.\n\n" +
        "## Workflow\n" +
        "1. **Send**: Your system POSTs a message to the `/webhook` endpoint.\n" +
        "2. **Receive (sync)**: The Agent reply is returned directly in the 200 response body.\n" +
        "3. **Receive (async)**: Set `async: true` — the endpoint returns 202 immediately, " +
        "and the Agent reply is pushed to your configured `pushUrl` when ready.\n" +
        "4. **Receive (stream)**: Set `stream: true` — the endpoint returns SSE chunks in real-time.\n\n" +
        "Both camelCase (`senderId`) and snake_case (`sender_id`) field names are accepted.",
      version: VERSION,
      contact: { url: "https://github.com/LiuZhiXiong/openclaw-custom-webhook" },
    },
    servers: [{ url: host, description: "Current gateway" }],
    paths: {
      [WEBHOOK_PATH]: {
        post: {
          summary: "Send message to Agent",
          description:
            "Send a message (with optional attachments) to the OpenClaw AI Agent.\n\n" +
            "**Field aliases**: `senderId` / `sender_id`, `chatId` / `chat_id`, " +
            "`text` / `message` / `content`, `isGroup` / `is_group`, `messageId` / `message_id`.\n\n" +
            "**Deduplication**: If `messageId` was already processed within the last 5 minutes, " +
            "the response returns `{ ok: true, deduplicated: true }` without re-processing.\n\n" +
            "**HMAC Signing**: If `hmacSecret` is configured, include `X-Webhook-Signature` (hex HMAC-SHA256) " +
            "and `X-Webhook-Timestamp` (Unix ms) headers for request integrity verification.",
          operationId: "sendMessage",
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "X-Webhook-Signature", in: "header", schema: { type: "string" }, description: "HMAC-SHA256 hex signature (optional, required if hmacSecret configured)" },
            { name: "X-Webhook-Timestamp", in: "header", schema: { type: "string" }, description: "Unix timestamp in ms (optional, required if hmacSecret configured)" },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["senderId", "text"],
                  properties: {
                    senderId:  { type: "string", description: "Unique sender identifier (alias: sender_id)" },
                    text:      { type: "string", description: "Message content (alias: message, content)" },
                    chatId:    { type: "string", description: "Conversation/group ID, defaults to senderId (alias: chat_id)" },
                    messageId: { type: "string", description: "Idempotency key for deduplication (alias: message_id). Auto-generated if omitted." },
                    async:     { type: "boolean", description: "If true, returns 202 immediately and pushes the Agent reply to pushUrl later", default: false },
                    stream:    { type: "boolean", description: "If true, returns SSE stream with real-time Agent response chunks", default: false },
                    isGroup:   { type: "boolean", description: "Whether this is a group chat (alias: is_group)", default: false },
                    attachments: {
                      type: "array",
                      description: "Optional media attachments (images, files). Images are forwarded to the Agent's vision pipeline.",
                      items: {
                        type: "object",
                        properties: {
                          type: { type: "string", enum: ["image", "file"], description: "Attachment type, defaults to 'file'" },
                          url:  { type: "string", format: "uri", description: "Publicly accessible URL of the attachment" },
                          name: { type: "string", description: "Display name (for files)" },
                        },
                        required: ["url"],
                      },
                    },
                  },
                },
                examples: {
                  simple: {
                    summary: "Simple text message",
                    value: { senderId: "user-123", text: "Hello, who are you?" },
                  },
                  withImage: {
                    summary: "Message with image attachment",
                    value: {
                      senderId: "user-123",
                      chatId: "chat-456",
                      text: "What is in this picture?",
                      attachments: [{ type: "image", url: "https://example.com/photo.jpg" }],
                    },
                  },
                  asyncMode: {
                    summary: "Async mode (pushUrl required)",
                    value: { senderId: "user-123", text: "Summarize this document", async: true },
                  },
                  streamMode: {
                    summary: "SSE streaming mode",
                    value: { senderId: "user-123", text: "Write an essay about AI", stream: true },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Agent reply (sync mode or SSE stream)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:          { type: "boolean", example: true },
                      reply:       { type: "string",  description: "Agent's text response" },
                      attachments: {
                        type: "array",
                        description: "Media files returned by the Agent",
                        items: {
                          type: "object",
                          properties: {
                            type: { type: "string" },
                            url:  { type: "string" },
                            text: { type: "string" },
                          },
                        },
                      },
                      deduplicated: { type: "boolean", description: "True if this messageId was already processed" },
                      timestamp:    { type: "number" },
                    },
                  },
                },
                "text/event-stream": {
                  schema: { type: "string", description: "SSE stream with event types: chunk, media, done" },
                },
              },
            },
            "202": {
              description: "Accepted (async mode). Agent will process in the background and POST the reply to your pushUrl.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok:        { type: "boolean", example: true },
                      async:     { type: "boolean", example: true },
                      messageId: { type: "string" },
                    },
                  },
                },
              },
            },
            "400": { description: "Bad request (e.g. async mode without pushUrl configured)" },
            "401": { description: "Unauthorized — missing or invalid Bearer token / HMAC signature" },
            "413": { description: "Request body too large (max 10MB)" },
            "429": { description: "Rate limited — too many requests from this sender" },
            "500": { description: "Internal processing error" },
            "504": { description: "Gateway timeout — Agent processing exceeded time limit" },
          },
        },
      },
      // --- Push Callback (outbound to your system) ---
      "/callback/push (your pushUrl)": {
        post: {
          summary: "Receive Agent reply (push callback)",
          description:
            "**This is NOT an endpoint on the gateway** — it documents the payload shape " +
            "that OpenClaw POSTs to your configured `pushUrl` when the Agent finishes processing.\n\n" +
            "Configure `pushUrl` and `pushSecret` in your openclaw.json:\n" +
            "```json\n" +
            "{\n" +
            '  "channels": {\n' +
            '    "custom-webhook": {\n' +
            '      "accounts": {\n' +
            '        "default": {\n' +
            '          "pushUrl": "https://your-system.com/receive",\n' +
            '          "pushSecret": "your-secret"\n' +
            "        }\n" +
            "      }\n" +
            "    }\n" +
            "  }\n" +
            "}\n" +
            "```\n\n" +
            "OpenClaw will include `Authorization: Bearer <pushSecret>` in the request header.\n" +
            "Retries: up to 3 attempts with exponential backoff (1s, 2s, 4s).",
          operationId: "pushCallback",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    type:      { type: "string", example: "agent_reply", description: "Always 'agent_reply'" },
                    senderId:  { type: "string", description: "Original sender who triggered the Agent" },
                    chatId:    { type: "string", description: "Conversation/group ID" },
                    reply:     { type: "string", description: "Agent's text response" },
                    attachments: {
                      type: "array",
                      description: "Media files returned by the Agent",
                      items: {
                        type: "object",
                        properties: {
                          type: { type: "string" },
                          url:  { type: "string" },
                          text: { type: "string" },
                        },
                      },
                    },
                    timestamp: { type: "number", description: "Unix timestamp (ms)" },
                  },
                },
                examples: {
                  textReply: {
                    summary: "Text-only reply",
                    value: {
                      type: "agent_reply",
                      senderId: "user-123",
                      chatId: "chat-456",
                      reply: "I am OpenClaw, an AI assistant.",
                      timestamp: 1774463000000,
                    },
                  },
                  withMedia: {
                    summary: "Reply with image attachment",
                    value: {
                      type: "agent_reply",
                      senderId: "user-123",
                      chatId: "chat-456",
                      reply: "Here is the chart you requested:",
                      attachments: [{ type: "image", url: "https://cdn.example.com/chart.png" }],
                      timestamp: 1774463000000,
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Your system should return 2xx to acknowledge receipt" },
          },
        },
      },
      // --- Health ---
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
                      ok:        { type: "boolean" },
                      plugin:    { type: "string" },
                      version:   { type: "string" },
                      uptime:    { type: "number", description: "Gateway uptime in seconds" },
                      timestamp: { type: "number", description: "Unix timestamp (ms)" },
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
        bearerAuth: { type: "http", scheme: "bearer", description: "Use the receiveSecret configured in openclaw.json" },
      },
    },
  };
}
