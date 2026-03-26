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
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SYS.API_DOCS // CUSTOM WEBHOOK</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    :root {
      --bg: #030407;
      --surface: #0a0b10;
      --panel: #0d0f16;
      --border: #1e2230;
      --text-main: #e2e8f0;
      --text-muted: #64748b;
      --accent: #FF5A00;
      --accent-dim: rgba(255, 90, 0, 0.15);
      --teal: #00F2FE;
      --teal-dim: rgba(0, 242, 254, 0.1);
      --green: #00FF66;
      --red: #FF003C;
      --font-ui: 'Outfit', sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text-main);
      font-family: var(--font-ui);
    }

    /* Grid background */
    body::before {
      content: ''; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px);
      background-size: 32px 32px;
      opacity: 0.06; z-index: 0; pointer-events: none;
    }

    /* Custom header */
    .api-header {
      position: sticky; top: 0; z-index: 100;
      padding: 16px 32px;
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
      background: rgba(10, 11, 16, 0.92);
      backdrop-filter: blur(16px);
    }
    .api-header::after {
      content: ''; position: absolute; bottom: -1px; left: 0; width: 40px; height: 1px; background: var(--teal);
    }
    .api-header-brand { display: flex; align-items: center; gap: 16px; }
    .api-header-icon {
      width: 36px; height: 36px;
      background: var(--teal-dim); border: 1px solid var(--teal);
      color: var(--teal); display: flex; align-items: center; justify-content: center;
      font-family: var(--font-mono); font-weight: 700; font-size: 16px;
      box-shadow: 0 0 12px var(--teal-dim);
    }
    .api-header h1 {
      font-family: var(--font-mono); font-size: 14px; font-weight: 700;
      letter-spacing: 1.5px; margin: 0; color: var(--text-main);
    }
    .api-header span {
      font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);
    }
    .api-header-links { display: flex; gap: 10px; }
    .api-header-links a {
      background: var(--panel); border: 1px solid var(--border);
      color: var(--text-muted); font-family: var(--font-mono); font-size: 11px;
      padding: 6px 14px; text-decoration: none; transition: all 0.2s;
    }
    .api-header-links a:hover {
      border-color: var(--teal); color: var(--teal); background: var(--teal-dim);
    }

    /* === SWAGGER UI OVERRIDES === */

    /* Hide default topbar */
    .swagger-ui .topbar { display: none !important; }

    /* Main wrapper */
    .swagger-ui { background: transparent !important; }
    .swagger-ui .wrapper { max-width: 1100px; padding: 32px; }

    /* Info section */
    .swagger-ui .info { margin: 24px 0 40px !important; }
    .swagger-ui .info hgroup.main { margin: 0; }
    .swagger-ui .info .title { font-family: var(--font-mono) !important; color: var(--text-main) !important; font-size: 20px !important; letter-spacing: 1px; }
    .swagger-ui .info .title small { background: var(--accent) !important; color: #fff !important; font-family: var(--font-mono) !important; border-radius: 0 !important; padding: 2px 8px !important; }
    .swagger-ui .info .description, .swagger-ui .info .description p { color: var(--text-muted) !important; font-family: var(--font-ui) !important; font-size: 14px !important; line-height: 1.7 !important; }
    .swagger-ui .info .description h2 { color: var(--teal) !important; font-family: var(--font-mono) !important; font-size: 13px !important; letter-spacing: 1px !important; margin-top: 20px !important; }
    .swagger-ui .info .description code { background: var(--panel) !important; color: var(--accent) !important; border: 1px solid var(--border) !important; padding: 1px 6px !important; font-family: var(--font-mono) !important; border-radius: 0 !important; }
    .swagger-ui .info a { color: var(--teal) !important; }

    /* Scheme / server selector */
    .swagger-ui .scheme-container { background: var(--surface) !important; border: 1px solid var(--border) !important; box-shadow: none !important; padding: 12px 20px !important; border-radius: 0 !important; }
    .swagger-ui .scheme-container label { color: var(--text-muted) !important; font-family: var(--font-mono) !important; font-size: 11px !important; }
    .swagger-ui select { background: var(--panel) !important; color: var(--teal) !important; border: 1px solid var(--border) !important; font-family: var(--font-mono) !important; border-radius: 0 !important; }

    /* Authorize button */
    .swagger-ui .btn.authorize { background: transparent !important; border: 1px solid var(--accent) !important; color: var(--accent) !important; font-family: var(--font-mono) !important; border-radius: 0 !important; padding: 6px 16px !important; font-size: 11px !important; letter-spacing: 0.5px; }
    .swagger-ui .btn.authorize:hover { background: var(--accent-dim) !important; box-shadow: 0 0 12px var(--accent-dim) !important; }
    .swagger-ui .btn.authorize svg { fill: var(--accent) !important; }

    /* Operation blocks */
    .swagger-ui .opblock { border: 1px solid var(--border) !important; border-radius: 0 !important; margin-bottom: 16px !important; background: var(--surface) !important; box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important; }
    .swagger-ui .opblock .opblock-summary { border: none !important; padding: 12px 20px !important; }
    .swagger-ui .opblock .opblock-summary-method { font-family: var(--font-mono) !important; font-weight: 700 !important; border-radius: 0 !important; font-size: 12px !important; letter-spacing: 1px !important; min-width: 60px !important; padding: 6px 12px !important; }
    .swagger-ui .opblock .opblock-summary-path { font-family: var(--font-mono) !important; color: var(--text-main) !important; font-size: 13px !important; }
    .swagger-ui .opblock .opblock-summary-path__deprecated { color: var(--text-muted) !important; }
    .swagger-ui .opblock .opblock-summary-description { font-family: var(--font-ui) !important; color: var(--text-muted) !important; font-size: 12px !important; }

    /* POST - Teal accent */
    .swagger-ui .opblock.opblock-post { border-left: 3px solid var(--teal) !important; background: linear-gradient(90deg, rgba(0, 242, 254, 0.03) 0%, var(--surface) 100%) !important; }
    .swagger-ui .opblock.opblock-post .opblock-summary-method { background: var(--teal) !important; color: var(--bg) !important; }
    .swagger-ui .opblock.opblock-post .opblock-summary { border-color: transparent !important; }

    /* GET - Amber accent */
    .swagger-ui .opblock.opblock-get { border-left: 3px solid var(--accent) !important; background: linear-gradient(90deg, rgba(255, 90, 0, 0.03) 0%, var(--surface) 100%) !important; }
    .swagger-ui .opblock.opblock-get .opblock-summary-method { background: var(--accent) !important; color: #fff !important; }

    /* Operation body */
    .swagger-ui .opblock-body { background: var(--bg) !important; }
    .swagger-ui .opblock-body pre { background: var(--panel) !important; color: var(--text-main) !important; border: 1px solid var(--border) !important; border-radius: 0 !important; font-family: var(--font-mono) !important; font-size: 12px !important; }
    .swagger-ui .opblock-body pre span { color: var(--teal) !important; }

    /* Parameters */
    .swagger-ui .opblock-section-header { background: var(--surface) !important; border-bottom: 1px solid var(--border) !important; box-shadow: none !important; }
    .swagger-ui .opblock-section-header h4 { color: var(--text-muted) !important; font-family: var(--font-mono) !important; font-size: 11px !important; letter-spacing: 1px !important; text-transform: uppercase !important; }
    .swagger-ui table thead tr th { color: var(--text-muted) !important; font-family: var(--font-mono) !important; font-size: 11px !important; border-bottom: 1px solid var(--border) !important; }
    .swagger-ui table tbody tr td { color: var(--text-main) !important; font-family: var(--font-ui) !important; border-bottom: 1px solid rgba(30, 34, 48, 0.5) !important; }
    .swagger-ui .parameter__name { font-family: var(--font-mono) !important; color: var(--teal) !important; }
    .swagger-ui .parameter__type { font-family: var(--font-mono) !important; color: var(--text-muted) !important; font-size: 11px !important; }
    .swagger-ui .parameter__in { font-family: var(--font-mono) !important; color: var(--text-muted) !important; font-size: 10px !important; }

    /* Models */
    .swagger-ui section.models { border: 1px solid var(--border) !important; border-radius: 0 !important; background: var(--surface) !important; }
    .swagger-ui section.models h4 { color: var(--text-muted) !important; font-family: var(--font-mono) !important; }
    .swagger-ui .model-box { background: var(--panel) !important; }
    .swagger-ui .model { color: var(--text-main) !important; font-family: var(--font-mono) !important; }
    .swagger-ui .prop-type { color: var(--accent) !important; }

    /* Response section */
    .swagger-ui .responses-inner { background: var(--bg) !important; }
    .swagger-ui .response-col_status { font-family: var(--font-mono) !important; color: var(--green) !important; }
    .swagger-ui .response-col_description { color: var(--text-muted) !important; }
    .swagger-ui .responses-header { font-family: var(--font-mono) !important; }

    /* Tabs */
    .swagger-ui .tab li { color: var(--text-muted) !important; font-family: var(--font-mono) !important; font-size: 11px !important; }
    .swagger-ui .tab li.active { color: var(--teal) !important; }
    .swagger-ui .tab li:first-child::after { background: var(--border) !important; }

    /* Try it out / Execute button */
    .swagger-ui .btn { border-radius: 0 !important; font-family: var(--font-mono) !important; }
    .swagger-ui .try-out__btn { border: 1px solid var(--teal) !important; color: var(--teal) !important; background: transparent !important; font-size: 11px !important; letter-spacing: 0.5px !important; }
    .swagger-ui .try-out__btn:hover { background: var(--teal-dim) !important; }
    .swagger-ui .btn.execute { background: var(--text-main) !important; color: var(--bg) !important; border: none !important; font-weight: 700 !important; letter-spacing: 1px !important; }
    .swagger-ui .btn.execute:hover { background: var(--accent) !important; color: #fff !important; }

    /* Inputs */
    .swagger-ui input[type=text], .swagger-ui textarea { background: var(--panel) !important; color: var(--text-main) !important; border: 1px solid var(--border) !important; border-radius: 0 !important; font-family: var(--font-mono) !important; }
    .swagger-ui input[type=text]:focus, .swagger-ui textarea:focus { border-color: var(--teal) !important; box-shadow: 0 0 0 2px var(--teal-dim) !important; }

    /* JSON highlight */
    .swagger-ui .highlight-code { background: var(--panel) !important; }
    .swagger-ui .microlight { background: var(--panel) !important; color: var(--text-main) !important; font-family: var(--font-mono) !important; border-radius: 0 !important; }

    /* Copy button */
    .swagger-ui .copy-to-clipboard { background: var(--surface) !important; border: 1px solid var(--border) !important; border-radius: 0 !important; }
    .swagger-ui .copy-to-clipboard button { background: transparent !important; }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: var(--bg); }
    ::-webkit-scrollbar-thumb { background: var(--border); }
    ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

    /* Arrow icons / SVGs */
    .swagger-ui svg:not(.model-toggle) { fill: var(--text-muted) !important; }
    .swagger-ui .expand-operation svg { fill: var(--text-muted) !important; width: 16px !important; }

    /* Loading */
    .swagger-ui .loading-container { background: var(--bg) !important; }
    .swagger-ui .loading-container .loading::after { color: var(--teal) !important; font-family: var(--font-mono) !important; }

    /* Examples dropdown */
    .swagger-ui .examples-select { background: var(--panel) !important; }

    /* Markdown inside descriptions */
    .swagger-ui .markdown p, .swagger-ui .markdown li { color: var(--text-muted) !important; }
    .swagger-ui .markdown code { background: var(--panel) !important; color: var(--accent) !important; }
    .swagger-ui .markdown pre { background: var(--panel) !important; border: 1px solid var(--border) !important; }
    .swagger-ui .renderedMarkdown p { color: var(--text-muted) !important; }

    /* Dialog/modal */
    .swagger-ui .dialog-ux .modal-ux { background: var(--surface) !important; border: 1px solid var(--border) !important; border-radius: 0 !important; }
    .swagger-ui .dialog-ux .modal-ux-header { border-bottom: 1px solid var(--border) !important; }
    .swagger-ui .dialog-ux .modal-ux-header h3 { color: var(--text-main) !important; font-family: var(--font-mono) !important; }
    .swagger-ui .dialog-ux .modal-ux-content { color: var(--text-muted) !important; }
    .swagger-ui .dialog-ux .modal-ux-content label { color: var(--text-muted) !important; font-family: var(--font-mono) !important; }

    /* ============================== */
    /* ======= LIGHT THEME ========= */
    /* ============================== */
    .theme-light {
      --bg: #f5f7fa;
      --surface: #ffffff;
      --panel: #eef0f4;
      --border: #d4d9e2;
      --text-main: #1a1d24;
      --text-muted: #5a6370;
      --accent: #d94800;
      --accent-dim: rgba(217, 72, 0, 0.1);
      --teal: #0891b2;
      --teal-dim: rgba(8, 145, 178, 0.08);
      --green: #059669;
      --red: #dc2626;
    }
    .theme-light body::before { opacity: 0.03; }
    /* Header */
    .theme-light .api-header { background: rgba(255,255,255,0.94) !important; }
    .theme-light .api-header-icon { box-shadow: 0 2px 8px var(--teal-dim) !important; }
    .theme-light .api-header-links a { background: #fff !important; color: var(--text-muted) !important; border-color: var(--border) !important; }
    .theme-light .api-header-links a:hover { background: var(--teal-dim) !important; color: var(--teal) !important; border-color: var(--teal) !important; }
    /* Operation blocks */
    .theme-light .swagger-ui .opblock { box-shadow: 0 1px 4px rgba(0,0,0,0.06) !important; }
    .theme-light .swagger-ui .opblock-body { background: var(--panel) !important; }
    .theme-light .swagger-ui .opblock-body pre { background: #fff !important; box-shadow: inset 0 1px 3px rgba(0,0,0,0.04) !important; }
    .theme-light .swagger-ui .opblock-section-header { background: var(--panel) !important; }
    .theme-light .swagger-ui .scheme-container { background: var(--panel) !important; }
    .theme-light .swagger-ui select { background: #fff !important; }
    /* Inputs */
    .theme-light .swagger-ui input[type=text], .theme-light .swagger-ui textarea { background: #fff !important; box-shadow: inset 0 1px 2px rgba(0,0,0,0.04) !important; }
    /* Models */
    .theme-light .swagger-ui section.models { background: var(--panel) !important; }
    .theme-light .swagger-ui .model-box { background: #fff !important; }
    /* Responses */
    .theme-light .swagger-ui .responses-inner { background: var(--panel) !important; }
    /* Highlight / code */
    .theme-light .swagger-ui .highlight-code, .theme-light .swagger-ui .microlight { background: #fff !important; }
    /* Modal */
    .theme-light .swagger-ui .dialog-ux .modal-ux { background: var(--surface) !important; box-shadow: 0 8px 32px rgba(0,0,0,0.12) !important; }
    /* Execute btn in light */
    .theme-light .swagger-ui .btn.execute { background: var(--text-main) !important; }
    /* Try-it button */
    .theme-light .swagger-ui .try-out__btn:hover { background: var(--teal-dim) !important; }
    /* Authorize */
    .theme-light .swagger-ui .btn.authorize:hover { background: var(--accent-dim) !important; box-shadow: 0 2px 8px var(--accent-dim) !important; }
    /* Copy button */
    .theme-light .swagger-ui .copy-to-clipboard { background: var(--panel) !important; }
    /* Scrollbar */
    .theme-light ::-webkit-scrollbar-track { background: var(--panel); }
    .theme-light ::-webkit-scrollbar-thumb { background: #c5cad3; }
    /* Theme toggle button */
    .theme-toggle-btn {
      background: var(--panel); border: 1px solid var(--border);
      color: var(--text-muted); font-family: var(--font-mono); font-size: 11px;
      padding: 6px 14px; cursor: pointer; transition: all 0.2s;
      text-decoration: none; display: flex; align-items: center; gap: 6px;
    }
    .theme-toggle-btn:hover { border-color: var(--teal); color: var(--teal); background: var(--teal-dim); }
  </style>
</head>
<body>
  <div class="api-header">
    <div class="api-header-brand">
      <div class="api-header-icon">✱</div>
      <div>
        <h1>SYS.API_DOCS</h1>
        <span>OPENCLAW CUSTOM WEBHOOK</span>
      </div>
    </div>
    <div class="api-header-links">
      <a href="/api/plugins/custom-webhook/panel">PANEL</a>
      <a href="/api/plugins/custom-webhook/openapi.json">RAW.JSON</a>
      <a href="/api/plugins/custom-webhook/health">HEALTH</a>
      <a href="/api/plugins/custom-webhook/events">EVENTS</a>
      <button class="theme-toggle-btn" id="themeBtn" onclick="toggleTheme()">LIGHT</button>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: "${specUrl}",
      dom_id: "#swagger-ui",
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: "BaseLayout",
      defaultModelsExpandDepth: 0,
      docExpansion: "list",
      syntaxHighlight: { activated: true, theme: "monokai" }
    });
    // Theme toggle
    function toggleTheme() {
      var isLight = document.documentElement.classList.toggle('theme-light');
      localStorage.setItem('cw_theme', isLight ? 'light' : 'dark');
      document.getElementById('themeBtn').textContent = isLight ? 'DARK' : 'LIGHT';
    }
    (function() {
      if (localStorage.getItem('cw_theme') === 'light') {
        document.documentElement.classList.add('theme-light');
        document.getElementById('themeBtn').textContent = 'DARK';
      }
    })();
  </script>
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
