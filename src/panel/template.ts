const OPENAPI_PATH = "/api/plugins/custom-webhook/openapi.json";
const DOCS_PATH = "/api/plugins/custom-webhook/docs";
const HEALTH_PATH = "/api/plugins/custom-webhook/health";

export function getPanelHtml(webhookUrl: string) {
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

/* Light theme */
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
/* Header & Layout */
.theme-light body::before { opacity: 0.04; }
.theme-light body::after { display: none; }
.theme-light .terminal-container { box-shadow: 0 0 60px rgba(0,0,0,0.08); }
.theme-light header { background: rgba(255, 255, 255, 0.92) !important; }
.theme-light header::after { background: var(--accent); }
/* Config bar */
.theme-light .config-bar { box-shadow: 0 2px 8px rgba(0,0,0,0.06) !important; }
.theme-light .config-item input[type="text"],
.theme-light .config-item input[type="password"] {
  background: #fff !important; border-color: var(--border) !important;
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.04) !important;
}
/* Buttons */
.theme-light .btn-action { background: #fff !important; border-color: var(--border) !important; color: var(--text-muted) !important; }
.theme-light .btn-action:hover { background: var(--teal-dim) !important; color: var(--teal) !important; border-color: var(--teal) !important; box-shadow: 0 2px 8px rgba(8,145,178,0.15) !important; }
.theme-light .btn-danger:hover { background: rgba(220,38,38,0.06) !important; color: var(--red) !important; border-color: var(--red) !important; box-shadow: 0 2px 8px rgba(220,38,38,0.12) !important; }
/* Status indicator */
.theme-light .status-indicator { background: rgba(5,150,105,0.06) !important; border-color: rgba(5,150,105,0.3) !important; }
.theme-light .status-indicator::before { box-shadow: 0 0 4px var(--green) !important; }
.theme-light .status-indicator.offline { background: rgba(220,38,38,0.06) !important; border-color: rgba(220,38,38,0.3) !important; }
/* Messages */
.theme-light .msg-content { background: var(--surface) !important; border-color: var(--border) !important; box-shadow: 0 1px 4px rgba(0,0,0,0.05) !important; }
.theme-light .msg-block.user .msg-content { background: var(--accent-dim) !important; border-color: rgba(217,72,0,0.2) !important; }
.theme-light .msg-block.system .msg-content { background: var(--teal-dim) !important; border-color: rgba(8,145,178,0.15) !important; }
/* Input area */
.theme-light .input-zone { background: var(--surface) !important; }
.theme-light .input-wrapper { background: var(--panel) !important; border-color: var(--border) !important; box-shadow: inset 0 1px 3px rgba(0,0,0,0.04) !important; }
.theme-light .input-wrapper:focus-within { border-color: var(--teal) !important; box-shadow: 0 0 0 2px var(--teal-dim) !important; }
.theme-light textarea { color: var(--text-main) !important; }
/* Send button */
.theme-light .send-btn { background: var(--accent-dim) !important; color: var(--accent) !important; border-color: rgba(217,72,0,0.25) !important; }
.theme-light .send-btn:hover { background: var(--accent) !important; color: #fff !important; }
.theme-light .send-btn:disabled { background: var(--panel) !important; color: var(--text-muted) !important; border-color: var(--border) !important; }
/* Toggle switch */
.theme-light .toggle-slider { background: #cdd5e0 !important; }
.theme-light .toggle-switch input:checked + .toggle-slider { background: var(--teal) !important; }
/* Brand icon */
.theme-light .brand-icon { box-shadow: 0 2px 8px var(--accent-dim) !important; }
/* Scrollbar */
.theme-light ::-webkit-scrollbar-track { background: var(--panel); }
.theme-light ::-webkit-scrollbar-thumb { background: #c5cad3; }
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
        <span>OPENCLAW PLUGIN [v2.0]</span>
      </div>
    </div>
    <div class="header-actions">
      <div class="status-indicator" id="status"><span id="statusText">PROBING...</span></div>
      <a href="${DOCS_PATH}" target="_blank" class="btn-action">API.DOCS</a>
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

    <div class="config-item">
      <label class="toggle-switch">
        <input type="checkbox" id="themeToggle">
        <div class="toggle-slider"></div>
        LIGHT.MODE
      </label>
    </div>
    <div class="msg-stats" id="msgCount">RECORDS: 0</div>
  </div>

  <div class="messages-wrapper" id="messages"></div>

  <div class="input-zone">
    <div class="input-wrapper" id="inputWrapper">
      <div class="input-prefix">&gt;</div>
      <textarea id="input" placeholder="Input command or query. [ENTER] to execute, [SHIFT+ENTER] for newline..." rows="1"></textarea>
      <button class="send-btn" id="sendBtn">EXECUTE \u23CE</button>
    </div>
  </div>
</div>

<script>
const webhookUrl="${webhookUrl}";
const msgsEl=document.getElementById("messages");
const input=document.getElementById("input");
const inputWrapper=document.getElementById("inputWrapper");
const sendBtn=document.getElementById("sendBtn");
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
secretInput.addEventListener("input",()=>localStorage.setItem(SECRET_KEY,secretInput.value));
senderInput.addEventListener("input",()=>localStorage.setItem(SENDER_KEY,senderInput.value));

// Theme toggle
const themeToggle=document.getElementById("themeToggle");
const THEME_KEY="cw_theme";
function applyTheme(light){
  if(light){document.documentElement.classList.add("theme-light");}
  else{document.documentElement.classList.remove("theme-light");}
}
const savedTheme=localStorage.getItem(THEME_KEY);
if(savedTheme==="light"){themeToggle.checked=true;applyTheme(true);}
themeToggle.addEventListener("change",()=>{
  const isLight=themeToggle.checked;
  applyTheme(isLight);
  localStorage.setItem(THEME_KEY,isLight?"light":"dark");
});

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
input.addEventListener("keydown",(e)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();doSend();}});
sendBtn.addEventListener("click",doSend);

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

async function doSend(){
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
    
    if(r.status===202){
      addSystem("> [ASYNC MODE] Task queued. Agent will dispatch to pushUrl independently.");
    }else if(r.ok){
      const data=await r.json();
      if(data.reply){
        renderMsg(data.reply,"agent",null,"AGENT");
      }else{
        addError("STATUS "+r.status+" - "+JSON.stringify(data));
      }
    }else{
      const data=await r.json().catch(()=>({error:"Unknown error"}));
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
