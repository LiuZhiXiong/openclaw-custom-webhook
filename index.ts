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
<title>SYS.TERMINAL // CUSTOM WEBHOOK</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
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
* { margin:0; padding:0; box-sizing:border-box; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

body { 
  font-family: var(--font-ui); 
  background: var(--bg); 
  color: var(--text-main); 
  height: 100vh; 
  display: flex; 
  justify-content: center;
  overflow: hidden;
  position: relative;
}

/* Subtle Grid Background */
body::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px);
  background-size: 32px 32px; background-position: center bottom;
  opacity: 0.1; z-index: 0; pointer-events: none;
}

/* Base Shadow & Glow */
body::after {
  content: ''; position: absolute; bottom: -50vh; left: 50%; width: 80vw; height: 80vh;
  background: radial-gradient(ellipse, rgba(0, 242, 254, 0.05) 0%, transparent 60%);
  transform: translateX(-50%); pointer-events: none; z-index: 0;
}

.terminal-container {
  width: 100%; max-width: 1200px;
  height: 100vh; display: flex; flex-direction: column;
  position: relative; z-index: 1;
  background: var(--bg);
  border-left: 1px solid var(--border);
  border-right: 1px solid var(--border);
  box-shadow: 0 0 120px rgba(0,0,0,0.6);
}

/* Header */
header {
  padding: 16px 32px;
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
  background: rgba(10, 11, 16, 0.85);
  backdrop-filter: blur(12px);
  position: relative;
}
header::after {
  content:''; position: absolute; bottom:-1px; left:0; width: 40px; height: 1px; background: var(--accent);
}
.header-brand { display: flex; align-items: center; gap: 16px; }
.brand-icon {
  width: 40px; height: 40px;
  background: var(--accent-dim);
  border: 1px solid var(--accent);
  color: var(--accent);
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-mono); font-weight: 700; font-size: 18px;
  box-shadow: 0 0 15px var(--accent-dim);
}
.brand-title { display: flex; flex-direction: column; }
.brand-title h1 {
  font-family: var(--font-mono); font-size: 15px; font-weight: 700;
  color: var(--text-main); letter-spacing: 1.5px;
}
.brand-title span {
  font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); letter-spacing: 0.5px;
}
.header-actions { display: flex; gap: 10px; align-items: center; }
.status-indicator {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-mono); font-size: 11px; color: var(--green);
  text-transform: uppercase; border: 1px solid rgba(0,255,102,0.25);
  padding: 4px 12px; background: rgba(0,255,102,0.05); letter-spacing: 0.5px;
}
.status-indicator::before {
  content: ''; width: 6px; height: 6px; background: var(--green); border-radius: 50%;
  box-shadow: 0 0 8px var(--green);
}
.status-indicator.offline {
  color: var(--red); border-color: rgba(255,0,60,0.25); background: rgba(255,0,60,0.05);
}
.status-indicator.offline::before {
  background: var(--red); box-shadow: 0 0 8px var(--red);
}
.btn-action {
  background: var(--panel); border: 1px solid var(--border);
  color: var(--text-muted); font-family: var(--font-mono); font-size: 11px;
  padding: 6px 14px; cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  text-decoration: none; display: flex; align-items: center; gap: 6px;
}
.btn-action:hover {
  border-color: var(--teal); color: var(--teal); background: var(--teal-dim); box-shadow: 0 0 10px var(--teal-dim);
}
.btn-danger:hover {
  border-color: var(--red); color: var(--red); background: rgba(255,0,60,0.1); box-shadow: 0 0 10px rgba(255,0,60,0.1);
}

/* Config Bar */
.config-bar {
  display: flex; align-items: center; gap: 24px;
  padding: 12px 32px; border-bottom: 1px solid var(--border);
  background: var(--surface);
  font-family: var(--font-mono); font-size: 11px;
  flex-wrap: wrap; box-shadow: 0 4px 20px rgba(0,0,0,0.4); z-index: 10;
}
.config-item { display: flex; align-items: center; gap: 10px; }
.config-item label { color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.config-item input[type="text"], .config-item input[type="password"] {
  background: var(--panel); border: 1px solid var(--border);
  color: var(--teal); font-family: var(--font-mono); font-size: 12px;
  padding: 6px 12px; width: 140px; transition: border-color 0.2s;
  outline: none; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
}
.config-item input:focus {
  border-color: var(--teal); box-shadow: 0 0 0 2px var(--teal-dim), inset 0 2px 4px rgba(0,0,0,0.2);
}
.config-item.sender-input input { width: 120px; color: var(--accent); }

/* Custom Checkbox */
.toggle-switch { display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--text-muted); }
.toggle-switch input { display: none; }
.toggle-slider {
  width: 32px; height: 16px; background: var(--panel); border: 1px solid var(--border);
  position: relative; transition: all 0.2s; border-radius: 2px;
}
.toggle-slider::after {
  content: ''; position: absolute; top: 2px; left: 2px; width: 10px; height: 10px;
  background: var(--text-muted); transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.toggle-switch input:checked + .toggle-slider {
  border-color: var(--teal); background: var(--teal-dim);
}
.toggle-switch input:checked + .toggle-slider::after {
  background: var(--teal); left: 18px; box-shadow: 0 0 5px var(--teal);
}
.msg-stats { margin-left: auto; color: var(--text-muted); opacity: 0.7; }

/* Messages Area */
.messages-wrapper {
  flex: 1; overflow-y: auto; padding: 40px 32px;
  display: flex; flex-direction: column; gap: 28px;
  scroll-behavior: smooth;
}

.msg-block {
  display: flex; flex-direction: column; max-width: 80%;
  animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  opacity: 0; transform: translateY(15px);
}
@keyframes slideIn { to { opacity: 1; transform: translateY(0); } }

.msg-block.user { align-self: flex-end; }
.msg-block.agent { align-self: flex-start; }

.msg-header {
  display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
  font-family: var(--font-mono); font-size: 11px;
}
.msg-block.user .msg-header { flex-direction: row-reverse; }

.sender-label {
  padding: 2px 8px; background: var(--surface); border: 1px solid var(--border);
  color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;
}
.msg-block.user .sender-label { color: var(--accent); border-color: rgba(255, 90, 0, 0.3); background: rgba(255, 90, 0, 0.03); }
.msg-block.agent .sender-label { color: var(--teal); border-color: rgba(0, 242, 254, 0.3); background: rgba(0, 242, 254, 0.03); }

.msg-time { color: var(--text-muted); opacity: 0.6; }

.msg-content {
  background: var(--surface); padding: 18px 24px;
  font-size: 15px; line-height: 1.6; color: var(--text-main);
  border: 1px solid var(--border);
  white-space: pre-wrap; word-break: break-word; font-weight: 300;
  box-shadow: 0 10px 30px rgba(0,0,0,0.2);
}
.msg-block.user .msg-content {
  border-right: 2px solid var(--accent);
  background: linear-gradient(90deg, var(--surface) 0%, rgba(255, 90, 0, 0.02) 100%);
}
.msg-block.agent .msg-content {
  border-left: 2px solid var(--teal);
  background: linear-gradient(90deg, rgba(0, 242, 254, 0.02) 0%, var(--surface) 100%);
}

.msg-system {
  align-self: center; font-family: var(--font-mono); font-size: 12px;
  color: var(--text-muted); padding: 8px 16px; border: 1px dashed var(--border);
  margin: 12px 0; text-align: center; max-width: 65%; background: var(--surface);
  letter-spacing: 0.5px;
}
.msg-error {
  align-self: center; font-family: var(--font-mono); font-size: 12px;
  color: var(--red); padding: 10px 20px; border: 1px solid rgba(255,0,60,0.4);
  background: rgba(255,0,60,0.05); margin: 12px 0; max-width: 85%;
  box-shadow: 0 0 15px rgba(255,0,60,0.1);
}

/* Typing Indicator */
.typing-content {
  display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); color: var(--teal); font-size: 13px; font-weight: 400; font-style: italic; letter-spacing: 0.5px;
}
.cursor-blink {
  display: inline-block; width: 8px; height: 16px; background: var(--teal);
  animation: blink 0.9s step-end infinite; box-shadow: 0 0 8px var(--teal);
}
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

/* Input Area */
.input-zone {
  padding: 24px 32px; background: rgba(10, 11, 16, 0.9);
  border-top: 1px solid var(--border);
  position: relative; backdrop-filter: blur(12px);
}
.input-zone::before { content: ''; position: absolute; top: -1px; left: 0; width: 40px; height: 1px; background: var(--teal); }
.input-zone::after { content: ''; position: absolute; top: -1px; right: 0; width: 40px; height: 1px; background: var(--accent); }

.input-wrapper {
  display: flex; gap: 16px; align-items: flex-end;
  background: var(--bg); border: 1px solid var(--border);
  padding: 16px 20px; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: inset 0 4px 12px rgba(0,0,0,0.3);
}
.input-wrapper.focus { border-color: rgba(226, 232, 240, 0.2); }

.input-prefix { font-family: var(--font-mono); color: var(--accent); font-size: 16px; padding-bottom: 3px; font-weight: 700; }
textarea {
  flex: 1; background: transparent; border: none; outline: none;
  font-family: var(--font-ui); font-size: 15px; color: var(--text-main); font-weight: 300;
  resize: none; line-height: 1.6; padding: 2px 0;
  height: 24px; max-height: 240px;
}
textarea::placeholder { color: var(--text-muted); font-family: var(--font-mono); font-size: 13px; letter-spacing: 0.5px; }

.send-btn {
  background: var(--text-main); color: var(--bg);
  border: none; padding: 8px 20px; font-family: var(--font-mono); font-size: 12px; font-weight: 700;
  text-transform: uppercase; cursor: pointer; display: flex; align-items: center; gap: 8px;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); height: 36px; letter-spacing: 1px;
}
.send-btn:hover { background: var(--accent); color: #fff; box-shadow: 0 0 20px var(--accent-dim); transform: translateY(-1px); }
.send-btn:active { transform: translateY(1px); }
.send-btn:disabled { background: var(--border); color: var(--text-muted); cursor: not-allowed; box-shadow: none; transform: none; }

@media (max-width: 768px) {
  .config-bar { padding: 12px 20px; gap: 12px; }
  .config-item label { min-width: auto; }
  .msg-block { max-width: 95%; }
  .input-zone { padding: 16px 20px; }
  header { padding: 16px 20px; }
}
</style>
</head>
<body>
<div class="terminal-container">
  <header>
    <div class="header-brand">
      <div class="brand-icon">\u271A</div>
      <div class="brand-title">
        <h1>SYS.WEBHOOK_TESTER</h1>
        <span>OPENCLAW PLUGIN [v1.6]</span>
      </div>
    </div>
    <div class="header-actions">
      <div class="status-indicator" id="status"><span id="statusText">PROBING...</span></div>
      <a href="${OPENAPI_PATH}" target="_blank" class="btn-action">DOCS.JSON</a>
      <a href="https://github.com/LiuZhiXiong/openclaw-custom-webhook" target="_blank" class="btn-action">REPO.SRC</a>
      <button class="btn-action btn-danger" onclick="clearChat()">PURGE.LOG</button>
    </div>
  </header>

  <div class="config-bar">
    <div class="config-item">
      <label>AUTH.TOKEN</label>
      <input type="password" spellcheck="false" id="secret" placeholder="Bearer...">
    </div>
    <div class="config-item sender-input">
      <label>USER.ID</label>
      <input type="text" spellcheck="false" id="sender" value="SYS_ADMIN">
    </div>
    <div class="config-item">
      <label class="toggle-switch">
        <input type="checkbox" id="async">
        <div class="toggle-slider"></div>
        ASYNC.MODE
      </label>
    </div>
    <div class="msg-stats" id="msgCount">RECORDS: 0</div>
  </div>

  <div class="messages-wrapper" id="messages"></div>

  <div class="input-zone">
    <div class="input-wrapper" id="inputWrapper">
      <div class="input-prefix">&gt;</div>
      <textarea id="input" placeholder="Input command or query. [ENTER] to execute, [SHIFT+ENTER] for newline..." rows="1"></textarea>
      <button class="send-btn" id="send">EXECUTE \u23CE</button>
    </div>
  </div>
</div>

<script>
const webhookUrl="${webhookUrl}";
const msgsEl=document.getElementById("messages");
const input=document.getElementById("input");
const inputWrapper=document.getElementById("inputWrapper");
const sendBtn=document.getElementById("send");
const secretInput=document.getElementById("secret");
const senderInput=document.getElementById("sender");
const asyncCheck=document.getElementById("async");
const statusDot=document.getElementById("status");
const statusText=document.getElementById("statusText");
const msgCountEl=document.getElementById("msgCount");

const STORAGE_KEY="cw_history_v2",SECRET_KEY="cw_secret",SENDER_KEY="cw_sender";
function loadHistory(){try{const s=localStorage.getItem(STORAGE_KEY);return s?JSON.parse(s):[];}catch{return[];}}
function saveHistory(h){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(h.slice(-200)));}catch{}}

const savedSecret=localStorage.getItem(SECRET_KEY);if(savedSecret)secretInput.value=savedSecret;
const savedSender=localStorage.getItem(SENDER_KEY);if(savedSender)senderInput.value=savedSender;
secretInput.addEventListener("change",()=>localStorage.setItem(SECRET_KEY,secretInput.value));
senderInput.addEventListener("change",()=>localStorage.setItem(SENDER_KEY,senderInput.value));

const history=loadHistory();
if(history.length>0){history.forEach(m=>renderMsg(m.text,m.type,m.time,m.sender,false));}
else{addSystem("> SYSTEM ONLINE. Auth token required for transmission.");}
updateCount();

input.addEventListener("focus", ()=>inputWrapper.classList.add("focus"));
input.addEventListener("blur", ()=>inputWrapper.classList.remove("focus"));
input.addEventListener("input",()=>{
  input.style.height="24px";
  input.style.height=Math.min(input.scrollHeight,240)+"px";
});
input.addEventListener("keydown",(e)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}});
sendBtn.addEventListener("click",send);

async function checkHealth(){
  try{
    const r=await fetch("${HEALTH_PATH}");
    if(r.ok){
      const d=await r.json();
      statusDot.className="status-indicator";
      statusText.textContent="UPTIME: " + fmtUp(d.uptime);
    } else {
      statusDot.className="status-indicator offline";
      statusText.textContent="ERR: " + r.status;
    }
  }catch{
    statusDot.className="status-indicator offline";
    statusText.textContent="OFFLINE";
  }
}
function fmtUp(s){
  if(s<60)return Math.round(s)+"S";
  if(s<3600)return Math.round(s/60)+"M";
  return Math.round(s/3600)+"H "+Math.round((s%3600)/60)+"M";
}
checkHealth();setInterval(checkHealth,10000);

function renderMsg(text, type, time, senderName, save=true) {
  if(type==="system"){addSystem(text);return;}
  if(type==="error"){addError(text);return;}
  
  const block=document.createElement("div");
  block.className="msg-block " + type;
  
  const header=document.createElement("div");
  header.className="msg-header";
  header.innerHTML="<span class='sender-label'>"+senderName+"</span><span class='msg-time'>["+(time||fmtTime())+"]</span>";
  
  const content=document.createElement("div");
  content.className="msg-content";
  content.textContent=text;
  
  block.appendChild(header);
  block.appendChild(content);
  msgsEl.appendChild(block);
  msgsEl.scrollTop=msgsEl.scrollHeight;
  
  if(save){
    const h=loadHistory();
    h.push({text,type,time:time||fmtTime(),sender:senderName});
    saveHistory(h);updateCount();
  }
}

function addSystem(t){
  const d=document.createElement("div");
  d.className="msg-system";d.textContent=t;
  msgsEl.appendChild(d);msgsEl.scrollTop=msgsEl.scrollHeight;
}
function addError(t){
  const d=document.createElement("div");
  d.className="msg-error";d.textContent="[ERROR] "+t;
  msgsEl.appendChild(d);msgsEl.scrollTop=msgsEl.scrollHeight;
}

function addTyping(){
  const block=document.createElement("div");
  block.className="msg-block agent";
  block.id="typing";
  
  const header=document.createElement("div");
  header.className="msg-header";
  header.innerHTML="<span class='sender-label'>AGENT</span><span class='msg-time'>[PROCESSING]</span>";
  
  const content=document.createElement("div");
  content.className="msg-content typing-content";
  content.innerHTML="AWAITING RESPONSE <span class='cursor-blink'></span>";
  
  block.appendChild(header);
  block.appendChild(content);
  msgsEl.appendChild(block);
  msgsEl.scrollTop=msgsEl.scrollHeight;
}
function removeTyping(){const t=document.getElementById("typing");if(t)t.remove();}
function fmtTime(){return new Date().toLocaleTimeString("en-US",{hour12:false,hour:"2-digit",minute:"2-digit",second:"2-digit"});}
function updateCount(){msgCountEl.textContent="RECORDS: "+loadHistory().length;}

function clearChat(){
  if(!confirm("Execute Purge Protocol? This will delete all local logs."))return;
  localStorage.removeItem(STORAGE_KEY);
  msgsEl.innerHTML="";
  addSystem("> SYSTEM LOGS PURGED");
  updateCount();
}

async function send(){
  const text=input.value.trim();
  const secret=secretInput.value.trim();
  const username=senderInput.value.trim()||"SYS_ADMIN";
  
  if(!text)return;
  if(!secret){addError("Authorization token required. Please provide Bearer token.");return;}
  
  renderMsg(text,"user",null,username);
  input.value="";
  input.style.height="24px";
  sendBtn.disabled=true;
  addTyping();
  
  try{
    const body={senderId:username,chatId:username,text};
    if(asyncCheck.checked)body.async=true;
    
    const r=await fetch(webhookUrl,{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+secret},
      body:JSON.stringify(body)
    });
    
    removeTyping();
    const data=await r.json();
    
    if(r.status===202){
      addSystem("> [ASYNC MODE] Task queued. Agent will dispatch to pushUrl independently.");
    }else if(r.ok&&data.reply){
      renderMsg(data.reply,"agent",null,"AGENT");
    }else{
      addError("STATUS "+r.status+" - "+JSON.stringify(data));
    }
  }catch(e){
    removeTyping();
    addError("CONNECTION REFUSED: "+e.message);
  }
  
  sendBtn.disabled=false;
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
      auth: "plugin",
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok: true,
          plugin: "custom-webhook",
          version: "1.6.5",
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
