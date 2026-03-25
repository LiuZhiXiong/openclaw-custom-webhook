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
<title>Custom Webhook - OpenClaw</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#060a14;--surface:rgba(17,24,39,.85);--surface2:rgba(30,41,59,.6);
  --glass:rgba(255,255,255,.03);--border:rgba(30,58,95,.5);--border2:rgba(0,212,255,.15);
  --text:#e2e8f0;--text2:#64748b;--text3:#475569;
  --cyan:#00d4ff;--cyan2:#0891b2;--blue:#3b82f6;--purple:#8b5cf6;
  --green:#22c55e;--red:#ef4444;
  --glow:0 0 20px rgba(0,212,255,.1);--font:'Inter',system-ui,-apple-system,sans-serif
}
body{font-family:var(--font);background:var(--bg);color:var(--text);height:100vh;display:flex;flex-direction:column;overflow:hidden}
body::before{content:'';position:fixed;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(ellipse at 20% 50%,rgba(0,212,255,.04) 0%,transparent 50%),radial-gradient(ellipse at 80% 20%,rgba(59,130,246,.03) 0%,transparent 50%);pointer-events:none;z-index:0}

header{background:var(--surface);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);padding:14px 24px;display:flex;align-items:center;gap:14px;flex-shrink:0;z-index:10;position:relative}
.logo{display:flex;align-items:center;gap:10px}
.logo-icon{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,var(--cyan),var(--blue));display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,212,255,.25)}
header h1{font-size:15px;font-weight:600;background:linear-gradient(135deg,var(--cyan),var(--blue));-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-.3px}
header .sub{font-size:11px;color:var(--text3);font-weight:400;margin-top:1px}
.status-pill{display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;background:var(--glass);border:1px solid var(--border);font-size:11px;color:var(--text2)}
.status-dot{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green);transition:all .3s}
.status-dot.off{background:var(--red);box-shadow:0 0 8px var(--red)}
header .spacer{flex:1}
.nav{display:flex;gap:6px}
.nav a,.nav button{color:var(--text2);text-decoration:none;font-family:var(--font);font-size:11px;padding:5px 12px;border:1px solid var(--border);border-radius:8px;transition:all .25s;cursor:pointer;background:transparent}
.nav a:hover,.nav button:hover{color:var(--cyan);border-color:var(--cyan);background:rgba(0,212,255,.05);transform:translateY(-1px)}

.config-bar{background:var(--surface);backdrop-filter:blur(12px);border-bottom:1px solid var(--border);padding:10px 24px;display:flex;gap:12px;align-items:center;flex-shrink:0;flex-wrap:wrap;z-index:5;position:relative}
.config-bar label{font-size:11px;color:var(--text3);font-weight:500;text-transform:uppercase;letter-spacing:.5px}
.config-bar input{font-family:var(--font);font-size:12px;background:rgba(15,23,42,.8);border:1px solid var(--border);border-radius:8px;padding:6px 10px;color:var(--text);outline:none;transition:all .25s}
.config-bar input:focus{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(0,212,255,.1)}
.config-bar input.secret{width:180px}
.config-bar input.sender{width:100px}
.cfg-toggle{display:flex;align-items:center;gap:5px;cursor:pointer}
.cfg-toggle input[type=checkbox]{accent-color:var(--cyan);cursor:pointer}
.cfg-toggle label{cursor:pointer}
.msg-count{font-size:10px;color:var(--text3);margin-left:auto}

.messages{flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:16px;scroll-behavior:smooth;z-index:1;position:relative}
.messages::-webkit-scrollbar{width:4px}
.messages::-webkit-scrollbar-track{background:transparent}
.messages::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px}

.msg-row{display:flex;gap:10px;animation:fadeIn .35s cubic-bezier(.4,0,.2,1)}
.msg-row.user{flex-direction:row-reverse}
.avatar{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;font-weight:600}
.avatar.user-av{background:linear-gradient(135deg,var(--blue),var(--purple));color:#fff}
.avatar.agent-av{background:linear-gradient(135deg,var(--cyan),var(--green));color:#fff}
.msg-bubble{max-width:70%;padding:12px 16px;border-radius:14px;font-size:13.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;position:relative}
.msg-row.user .msg-bubble{background:linear-gradient(135deg,rgba(59,130,246,.85),rgba(8,145,178,.85));color:#fff;border-bottom-right-radius:4px;box-shadow:0 2px 12px rgba(59,130,246,.2)}
.msg-row.agent .msg-bubble{background:var(--surface2);backdrop-filter:blur(8px);border:1px solid var(--border);border-bottom-left-radius:4px;box-shadow:var(--glow)}
.msg-bubble .meta{font-size:10px;margin-top:6px;opacity:.5}
.msg.system{align-self:center;background:transparent;color:var(--text3);font-size:12px;padding:8px 16px;text-align:center}
.msg.error{align-self:center;background:rgba(59,17,17,.6);color:var(--red);font-size:12px;border:1px solid rgba(92,28,28,.5);border-radius:10px;padding:8px 16px;backdrop-filter:blur(8px)}

.typing-row{display:flex;gap:10px;animation:fadeIn .3s}
.typing-bubble{padding:12px 18px;background:var(--surface2);border:1px solid var(--border);border-radius:14px;border-bottom-left-radius:4px}
.typing-bubble span{display:inline-block;width:7px;height:7px;background:var(--text3);border-radius:50%;animation:bounce .6s infinite alternate;margin:0 2px}
.typing-bubble span:nth-child(2){animation-delay:.15s}
.typing-bubble span:nth-child(3){animation-delay:.3s}
@keyframes bounce{to{transform:translateY(-8px);opacity:.3}}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}

.input-bar{background:var(--surface);backdrop-filter:blur(20px);border-top:1px solid var(--border);padding:14px 24px;display:flex;gap:10px;flex-shrink:0;z-index:10;position:relative}
.input-bar textarea{flex:1;font-family:var(--font);font-size:13.5px;background:rgba(15,23,42,.8);border:1px solid var(--border);border-radius:12px;padding:11px 16px;color:var(--text);outline:none;resize:none;height:44px;max-height:120px;transition:all .25s;line-height:1.4}
.input-bar textarea:focus{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(0,212,255,.08)}
.input-bar textarea::placeholder{color:var(--text3)}
.send-btn{width:44px;height:44px;border-radius:12px;border:none;background:linear-gradient(135deg,var(--cyan),var(--blue));color:#fff;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:all .2s;box-shadow:0 2px 10px rgba(0,212,255,.25)}
.send-btn:hover{transform:scale(1.05);box-shadow:0 4px 16px rgba(0,212,255,.35)}
.send-btn:active{transform:scale(.95)}
.send-btn:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}
.send-btn svg{width:18px;height:18px}
@media(max-width:640px){.nav a,.nav button{padding:4px 8px;font-size:10px}.config-bar{padding:8px 16px;gap:8px}.messages{padding:16px}.msg-bubble{max-width:85%}.input-bar{padding:10px 16px}}
</style>
</head>
<body>
<header>
  <div class="logo"><div class="logo-icon">\u{1F99E}</div><div><h1>Custom Webhook Tester</h1><div class="sub">OpenClaw Plugin v1.5</div></div></div>
  <div class="status-pill"><div class="status-dot" id="status"></div><span id="statusText">\u68C0\u67E5\u4E2D...</span></div>
  <div class="spacer"></div>
  <div class="nav">
    <a href="${OPENAPI_PATH}" target="_blank">\u{1F4CB} API</a>
    <a href="https://github.com/LiuZhiXiong/openclaw-custom-webhook" target="_blank">\u2B50 GitHub</a>
    <button onclick="clearChat()" title="\u6E05\u7A7A\u804A\u5929">\u{1F5D1}</button>
  </div>
</header>
<div class="config-bar">
  <label>Secret</label>
  <input type="password" class="secret" id="secret" placeholder="Bearer token">
  <label>Sender</label>
  <input type="text" class="sender" id="sender" placeholder="user1" value="panel-user">
  <div class="cfg-toggle"><input type="checkbox" id="async"><label for="async">Async</label></div>
  <span class="msg-count" id="msgCount">0 \u6761\u6D88\u606F</span>
</div>
<div class="messages" id="messages"></div>
<div class="input-bar">
  <textarea id="input" placeholder="\u8F93\u5165\u6D88\u606F... (Enter \u53D1\u9001, Shift+Enter \u6362\u884C)" rows="1"></textarea>
  <button class="send-btn" id="send" title="\u53D1\u9001"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
</div>
<script>
const webhookUrl="${webhookUrl}";
const msgsEl=document.getElementById("messages");
const input=document.getElementById("input");
const sendBtn=document.getElementById("send");
const secretInput=document.getElementById("secret");
const senderInput=document.getElementById("sender");
const asyncCheck=document.getElementById("async");
const statusDot=document.getElementById("status");
const statusText=document.getElementById("statusText");
const msgCountEl=document.getElementById("msgCount");

const STORAGE_KEY="cw_history",SECRET_KEY="cw_secret",SENDER_KEY="cw_sender";
function loadHistory(){try{const s=localStorage.getItem(STORAGE_KEY);return s?JSON.parse(s):[];}catch{return[];}}
function saveHistory(h){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(h.slice(-200)));}catch{}}

const savedSecret=localStorage.getItem(SECRET_KEY);if(savedSecret)secretInput.value=savedSecret;
const savedSender=localStorage.getItem(SENDER_KEY);if(savedSender)senderInput.value=savedSender;
secretInput.addEventListener("change",()=>localStorage.setItem(SECRET_KEY,secretInput.value));
senderInput.addEventListener("change",()=>localStorage.setItem(SENDER_KEY,senderInput.value));

const history=loadHistory();
if(history.length>0){history.forEach(m=>renderMsg(m.text,m.type,m.time,false));}
else{addSystem("\u{1F44B} \u8F93\u5165 Bearer token \u5E76\u53D1\u9001\u6D88\u606F\uFF0C\u5F00\u59CB\u4E0E AI Agent \u5BF9\u8BDD");}
updateCount();

input.addEventListener("input",()=>{input.style.height="44px";input.style.height=Math.min(input.scrollHeight,120)+"px";});
input.addEventListener("keydown",(e)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}});
sendBtn.addEventListener("click",send);

async function checkHealth(){
  try{const r=await fetch("${HEALTH_PATH}");if(r.ok){const d=await r.json();statusDot.className="status-dot";statusText.textContent="\u8FD0\u884C\u4E2D \u00B7 "+fmtUp(d.uptime);}else{statusDot.className="status-dot off";statusText.textContent="\u5F02\u5E38";}}
  catch{statusDot.className="status-dot off";statusText.textContent="\u79BB\u7EBF";}
}
function fmtUp(s){if(s<60)return Math.round(s)+"s";if(s<3600)return Math.round(s/60)+"m";return Math.round(s/3600)+"h "+Math.round((s%3600)/60)+"m";}
checkHealth();setInterval(checkHealth,10000);

function renderMsg(text,type,time,save=true){
  if(type==="system"){addSystem(text);return;}if(type==="error"){addError(text);return;}
  const row=document.createElement("div");row.className="msg-row "+type;
  const av=document.createElement("div");av.className="avatar "+(type==="user"?"user-av":"agent-av");av.textContent=type==="user"?"U":"\u{1F99E}";
  const bubble=document.createElement("div");bubble.className="msg-bubble";bubble.textContent=text;
  const meta=document.createElement("div");meta.className="meta";meta.textContent=time||fmtTime();bubble.appendChild(meta);
  row.appendChild(av);row.appendChild(bubble);msgsEl.appendChild(row);msgsEl.scrollTop=msgsEl.scrollHeight;
  if(save){const h=loadHistory();h.push({text,type,time:time||fmtTime()});saveHistory(h);updateCount();}
}
function addSystem(t){const d=document.createElement("div");d.className="msg system";d.textContent=t;msgsEl.appendChild(d);msgsEl.scrollTop=msgsEl.scrollHeight;}
function addError(t){const d=document.createElement("div");d.className="msg error";d.textContent=t;msgsEl.appendChild(d);msgsEl.scrollTop=msgsEl.scrollHeight;}
function addTyping(){const row=document.createElement("div");row.className="typing-row";row.id="typing";const av=document.createElement("div");av.className="avatar agent-av";av.textContent="\u{1F99E}";const b=document.createElement("div");b.className="typing-bubble";b.innerHTML="<span></span><span></span><span></span>";row.appendChild(av);row.appendChild(b);msgsEl.appendChild(row);msgsEl.scrollTop=msgsEl.scrollHeight;}
function removeTyping(){const t=document.getElementById("typing");if(t)t.remove();}
function fmtTime(){return new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",second:"2-digit"});}
function updateCount(){msgCountEl.textContent=loadHistory().length+" \u6761\u6D88\u606F";}
function clearChat(){if(!confirm("\u786E\u8BA4\u6E05\u7A7A\u804A\u5929\u8BB0\u5F55\uFF1F"))return;localStorage.removeItem(STORAGE_KEY);msgsEl.innerHTML="";addSystem("\u{1F5D1} \u804A\u5929\u5DF2\u6E05\u7A7A");updateCount();}

async function send(){
  const text=input.value.trim();const secret=secretInput.value.trim();
  if(!text)return;if(!secret){addError("\u8BF7\u5148\u8F93\u5165 Bearer token");return;}
  renderMsg(text,"user");input.value="";input.style.height="44px";sendBtn.disabled=true;addTyping();
  try{
    const body={senderId:senderInput.value||"panel-user",chatId:senderInput.value||"panel-user",text};
    if(asyncCheck.checked)body.async=true;
    const r=await fetch(webhookUrl,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+secret},body:JSON.stringify(body)});
    removeTyping();const data=await r.json();
    if(r.status===202){addSystem("\u23F3 \u5DF2\u63A5\u53D7 (async)\uFF0C\u7ED3\u679C\u5C06\u901A\u8FC7 pushUrl \u63A8\u9001");}
    else if(r.ok&&data.reply){renderMsg(data.reply,"agent");}
    else{addError(r.status+": "+JSON.stringify(data));}
  }catch(e){removeTyping();addError("\u8FDE\u63A5\u5931\u8D25: "+e.message);}
  sendBtn.disabled=false;input.focus();
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
      auth: "plugin",
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
      auth: "plugin",
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const host = `http://${req.headers.host ?? "localhost:18789"}`;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(getPanelHtml(`${host}${WEBHOOK_PATH}`));
      },
    });

    // OpenAPI Spec
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
