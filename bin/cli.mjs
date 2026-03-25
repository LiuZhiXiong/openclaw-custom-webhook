#!/usr/bin/env node

/**
 * openclaw-custom-webhook CLI
 *
 * Usage:
 *   npx openclaw-custom-webhook install   # 一键安装：安装插件 + 创建 symlink + 配置 + 重启
 *   npx openclaw-custom-webhook setup     # 仅配置 receiveSecret / pushUrl
 *   npx openclaw-custom-webhook test      # 发测试消息
 *   npx openclaw-custom-webhook fix-sdk   # 手动修复 plugin-sdk symlink
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync, spawn } from "node:child_process";
import readline from "node:readline";

const OPENCLAW_DIR = path.join(os.homedir(), ".openclaw");
const CONFIG_PATH = path.join(OPENCLAW_DIR, "openclaw.json");
const PLUGIN_DIR = path.join(OPENCLAW_DIR, "extensions", "custom-webhook");

// Shared readline — one instance for all prompts
let _rl;
function getRL() {
  if (!_rl) {
    _rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    _rl.on("close", () => { _rl = null; });
  }
  return _rl;
}
function closeRL() { if (_rl) { _rl.close(); _rl = null; } }

function ask(question) {
  return new Promise((resolve) => {
    const rl = getRL();
    rl.question(question, (ans) => resolve(ans.trim()));
  });
}

function log(msg) { console.log(`\x1b[36m[custom-webhook]\x1b[0m ${msg}`); }
function ok(msg)  { console.log(`\x1b[32m✅\x1b[0m ${msg}`); }
function warn(msg){ console.log(`\x1b[33m⚠️\x1b[0m  ${msg}`); }
function err(msg) { console.log(`\x1b[31m❌\x1b[0m ${msg}`); }

// =========================================
// Find OpenClaw installation
// =========================================
function isOpenClawPkg(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"));
    return pkg.name === "openclaw";
  } catch { return false; }
}

function walkUpForOpenClaw(startDir) {
  let cursor = startDir;
  for (let i = 0; i < 10; i++) {
    if (isOpenClawPkg(cursor)) return cursor;
    // Check node_modules/openclaw at this level
    const nmOC = path.join(cursor, "node_modules", "openclaw");
    if (isOpenClawPkg(nmOC)) return nmOC;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return null;
}

function findOpenClawRoot() {
  const candidates = [];

  // 1. npm global
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    candidates.push(path.join(globalRoot, "openclaw"));
  } catch {}

  // 2. pnpm global
  try {
    const pnpmRoot = execSync("pnpm root -g", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    candidates.push(path.join(pnpmRoot, "openclaw"));
  } catch {}

  // 3. Resolve from `which openclaw` binary (covers nvm, fnm, volta, brew, etc.)
  for (const whichCmd of ["which openclaw", "command -v openclaw"]) {
    try {
      const bin = execSync(whichCmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], shell: true }).trim();
      if (!bin) continue;
      let realBin = bin;
      try { realBin = fs.realpathSync(bin); } catch {}
      // Walk up from the binary to find package root
      const found = walkUpForOpenClaw(path.dirname(realBin));
      if (found) return found;
    } catch {}
  }

  // 4. Common install paths (homebrew, system, user-local)
  const home = os.homedir();
  candidates.push(
    // Homebrew (macOS)
    "/opt/homebrew/lib/node_modules/openclaw",
    "/usr/local/lib/node_modules/openclaw",
    // System
    "/usr/lib/node_modules/openclaw",
    // User-local npm/pnpm
    path.join(home, ".npm-global/lib/node_modules/openclaw"),
    path.join(home, "Library/pnpm/global/5/node_modules/openclaw"),
    path.join(home, ".local/share/pnpm/global/5/node_modules/openclaw"),
    // nvm common locations
    ...(() => {
      try {
        const nvmDir = process.env.NVM_DIR || path.join(home, ".nvm");
        const versions = path.join(nvmDir, "versions/node");
        if (fs.existsSync(versions)) {
          return fs.readdirSync(versions)
            .map(v => path.join(versions, v, "lib/node_modules/openclaw"))
            .reverse(); // newest first
        }
      } catch {}
      return [];
    })(),
    // fnm
    ...(() => {
      try {
        const fnmDir = process.env.FNM_DIR || path.join(home, ".fnm/node-versions");
        if (fs.existsSync(fnmDir)) {
          return fs.readdirSync(fnmDir)
            .map(v => path.join(fnmDir, v, "installation/lib/node_modules/openclaw"))
            .reverse();
        }
      } catch {}
      return [];
    })(),
    // volta
    path.join(home, ".volta/tools/image/packages/openclaw"),
  );

  for (const p of candidates) {
    if (isOpenClawPkg(p)) return p;
  }

  return null;
}

// =========================================
// Create symlink for plugin-sdk
// =========================================
async function fixSdk() {
  log("查找 OpenClaw 安装位置...");
  let root = findOpenClawRoot();

  if (!root) {
    warn("自动检测未找到 OpenClaw 安装。");
    console.log("  常见安装方式:");
    console.log("    npm install -g openclaw");
    console.log("    pnpm add -g openclaw");
    console.log("");
    const manual = await ask("请输入 OpenClaw 安装路径（留空跳过）: ");
    if (manual && isOpenClawPkg(manual)) {
      root = manual;
    } else if (manual) {
      // Maybe they gave the bin dir, try walking up
      const found = walkUpForOpenClaw(manual);
      if (found) {
        root = found;
      } else {
        err(`路径 ${manual} 不是有效的 OpenClaw 安装目录`);
        return false;
      }
    } else {
      err("跳过 symlink 创建。插件可能无法加载，请手动修复。");
      return false;
    }
  }
  ok(`找到 OpenClaw: ${root}`);

  const nodeModulesDir = path.join(PLUGIN_DIR, "node_modules");
  const link = path.join(nodeModulesDir, "openclaw");

  // Check existing
  try {
    const existing = fs.realpathSync(link);
    const realRoot = fs.realpathSync(root);
    if (existing === realRoot) {
      ok("symlink 已存在且正确");
      return true;
    }
    fs.unlinkSync(link);
  } catch {}

  fs.mkdirSync(nodeModulesDir, { recursive: true });
  try {
    fs.symlinkSync(root, link, "dir");
    ok(`已创建 symlink: node_modules/openclaw -> ${root}`);
    return true;
  } catch (e) {
    err(`创建 symlink 失败: ${e.message}`);
    warn(`请手动执行: ln -sf ${root} ${link}`);
    return false;
  }
}

// =========================================
// Read/write openclaw.json config
// =========================================
function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
}

// =========================================
// Setup: configure receiveSecret / pushUrl
// =========================================
async function setupConfig() {
  log("配置 custom-webhook 插件...\n");

  const cfg = readConfig();

  // Existing values
  const existing = cfg.channels?.["custom-webhook"]?.accounts?.default ?? {};

  let receiveSecret = "";
  if (existing.receiveSecret) {
    const input = await ask(`接收密钥 (receiveSecret) [回车保留现有 / 输入新值]: `);
    receiveSecret = input || existing.receiveSecret;
  } else {
    while (!receiveSecret) {
      receiveSecret = await ask(`接收密钥 (receiveSecret, 输入 auto 自动生成) [必填]: `);
      if (receiveSecret === "auto") {
        const { randomBytes } = await import("node:crypto");
        receiveSecret = randomBytes(24).toString("hex");
        ok(`已生成密钥: ${receiveSecret}`);
      }
      if (!receiveSecret) warn("receiveSecret 不能为空！");
    }
  }
  const pushUrl = await ask(
    `推送地址 (pushUrl, 留空跳过) [${existing.pushUrl || "未配置"}]: `
  ) || existing.pushUrl || "";
  const pushSecret = pushUrl
    ? (await ask(`推送密钥 (pushSecret, 留空跳过) [${existing.pushSecret ? "***已配置***" : "未配置"}]: `) || existing.pushSecret || "")
    : (existing.pushSecret || "");

  // Merge config
  if (!cfg.channels) cfg.channels = {};
  if (!cfg.channels["custom-webhook"]) cfg.channels["custom-webhook"] = {};
  if (!cfg.channels["custom-webhook"].accounts) cfg.channels["custom-webhook"].accounts = {};
  if (!cfg.channels["custom-webhook"].accounts.default) cfg.channels["custom-webhook"].accounts.default = {};

  const acct = cfg.channels["custom-webhook"].accounts.default;
  if (receiveSecret) acct.receiveSecret = receiveSecret;
  if (pushUrl) acct.pushUrl = pushUrl;
  if (pushSecret) acct.pushSecret = pushSecret;

  // Enable plugin
  if (!cfg.plugins) cfg.plugins = {};
  if (!cfg.plugins.entries) cfg.plugins.entries = {};
  if (!cfg.plugins.entries["custom-webhook"]) cfg.plugins.entries["custom-webhook"] = {};
  cfg.plugins.entries["custom-webhook"].enabled = true;

  writeConfig(cfg);
  ok(`配置已写入: ${CONFIG_PATH}`);
  console.log("");
  console.log("  receiveSecret:", acct.receiveSecret ? "***" : "(未设置)");
  console.log("  pushUrl:", acct.pushUrl || "(未设置)");
  console.log("  pushSecret:", acct.pushSecret ? "***" : "(未设置)");
  console.log("");
}

// =========================================
// Install: all-in-one
// =========================================
async function install() {
  console.log("");
  console.log("🔧 Custom Webhook 一键安装");
  console.log("=".repeat(40));
  console.log("");

  // Step 1: Install plugin via openclaw CLI
  log("步骤 1/4: 安装插件...");
  try {
    const hasOpenclaw = execSync("which openclaw", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (!hasOpenclaw) throw new Error("not found");
  } catch {
    err("未找到 openclaw 命令。请先安装: npm install -g openclaw");
    process.exit(1);
  }

  try {
    execSync("openclaw plugins install openclaw-custom-webhook", {
      encoding: "utf-8",
      stdio: ["inherit", "inherit", "inherit"],
    });
    ok("插件安装完成");
  } catch (e) {
    warn("插件安装遇到问题（可能已安装），继续...");
  }
  console.log("");

  // Step 2: Fix SDK symlink
  log("步骤 2/4: 修复 plugin-sdk 链接...");
  await fixSdk();
  console.log("");

  // Step 3: Configure
  log("步骤 3/4: 配置插件...");
  await setupConfig();

  // Step 4: Restart gateway
  log("步骤 4/4: 重启 Gateway...");
  const restart = await ask("是否重启 Gateway？(y/n) [y]: ");
  if (restart === "" || restart.toLowerCase() === "y") {
    try {
      execSync("openclaw gateway restart", { stdio: ["inherit", "inherit", "inherit"] });
      ok("Gateway 已重启");
    } catch {
      warn("Gateway 重启失败，请手动执行: openclaw gateway restart");
    }
  }

  console.log("");
  console.log("\x1b[36m" + "=".repeat(50) + "\x1b[0m");
  ok("安装完成！");
  console.log("");
  console.log("\x1b[1m📌 快速入口:\x1b[0m");
  console.log("");
  console.log("  \x1b[36m🖥  Web 测试面板:\x1b[0m  http://localhost:18789/api/plugins/custom-webhook/panel");
  console.log("  \x1b[36m📋 OpenAPI 文档:\x1b[0m  http://localhost:18789/api/plugins/custom-webhook/openapi.json");
  console.log("  \x1b[36m🏥 Health 检查:\x1b[0m   http://localhost:18789/api/plugins/custom-webhook/health");
  console.log("");
  console.log("\x1b[1m🚀 下一步:\x1b[0m");
  console.log("");
  const secret = readConfig().channels?.["custom-webhook"]?.accounts?.default?.receiveSecret ?? "YOUR_SECRET";
  console.log(`  \x1b[33m# 在浏览器中测试:\x1b[0m`);
  console.log(`  npx openclaw-custom-webhook open`);
  console.log("");
  console.log(`  \x1b[33m# 或用 curl 发消息:\x1b[0m`);
  console.log(`  curl -X POST http://localhost:18789/api/plugins/custom-webhook/webhook \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -H "Authorization: Bearer ${secret}" \\`);
  console.log(`    -d '{"senderId":"test","text":"hello"}'`);
  console.log("");
  console.log(`  \x1b[33m# 或用 CLI 测试:\x1b[0m`);
  console.log(`  npx openclaw-custom-webhook test`);
  console.log("");
  console.log(`  \x1b[33m# 查看插件状态:\x1b[0m`);
  console.log(`  npx openclaw-custom-webhook status`);
  console.log("");
}

// =========================================
// Test: send a test message
// =========================================
async function test() {
  const cfg = readConfig();
  const acct = cfg.channels?.["custom-webhook"]?.accounts?.default ?? {};
  const secret = acct.receiveSecret;

  if (!secret) {
    err("未配置 receiveSecret，请先运行: npx openclaw-custom-webhook install");
    process.exit(1);
  }

  const port = await ask("Gateway 端口 [18789]: ") || "18789";
  const text = await ask("发送内容 [hello from webhook]: ") || "hello from webhook";

  log(`发送测试消息到 localhost:${port}...`);

  try {
    const resp = await fetch(`http://localhost:${port}/api/plugins/custom-webhook/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ senderId: "cli-test", chatId: "cli-test", text }),
    });
    const data = await resp.json();

    if (resp.ok) {
      ok(`Agent 回复: ${data.reply}`);
    } else {
      err(`请求失败 (${resp.status}): ${JSON.stringify(data)}`);
    }
  } catch (e) {
    err(`连接失败: ${e.message}`);
    warn("请确认 Gateway 正在运行");
  }
}

// =========================================
// Open: open web panel in browser
// =========================================
async function openPanel() {
  const port = await ask("Gateway 端口 [18789]: ") || "18789";
  const url = `http://localhost:${port}/api/plugins/custom-webhook/panel`;
  log(`打开 Web 测试面板: ${url}`);

  try {
    // Check health first
    const resp = await fetch(`http://localhost:${port}/api/plugins/custom-webhook/health`);
    if (resp.ok) {
      const data = await resp.json();
      ok(`Gateway 运行中 (uptime: ${Math.round(data.uptime)}s)`);
    }
  } catch {
    warn("Gateway 可能未运行，请先启动");
  }

  const { platform } = process;
  try {
    if (platform === "darwin") execSync(`open "${url}"`);
    else if (platform === "win32") execSync(`start "" "${url}"`);
    else execSync(`xdg-open "${url}"`);
    ok("已在浏览器中打开");
  } catch {
    console.log(`请手动打开: ${url}`);
  }
}

// =========================================
// Status: show plugin status
// =========================================
async function status() {
  const cfg = readConfig();
  const acct = cfg.channels?.["custom-webhook"]?.accounts?.default ?? {};
  const pluginEntry = cfg.plugins?.entries?.["custom-webhook"];
  const pluginInstalled = fs.existsSync(PLUGIN_DIR);
  let pluginVersion = "未安装";
  if (pluginInstalled) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(PLUGIN_DIR, "package.json"), "utf-8"));
      pluginVersion = pkg.version ?? "未知";
    } catch {}
  }

  console.log("");
  console.log("\x1b[1m🦞 Custom Webhook 插件状态\x1b[0m");
  console.log("\x1b[36m" + "─".repeat(40) + "\x1b[0m");
  console.log("");
  console.log(`  \x1b[1m插件版本:\x1b[0m   ${pluginVersion}`);
  console.log(`  \x1b[1m插件目录:\x1b[0m   ${pluginInstalled ? "✅ " + PLUGIN_DIR : "❌ 未安装"}`);
  console.log(`  \x1b[1m已启用:\x1b[0m     ${pluginEntry?.enabled ? "✅ 是" : "❌ 否"}`);
  console.log("");
  console.log("\x1b[36m  配置:\x1b[0m");
  console.log(`  receiveSecret: ${acct.receiveSecret ? "✅ 已配置" : "❌ 未配置"}`);
  console.log(`  pushUrl:       ${acct.pushUrl || "未配置"}`);
  console.log(`  pushSecret:    ${acct.pushSecret ? "✅ 已配置" : "未配置"}`);
  console.log("");

  // Check gateway
  try {
    const resp = await fetch("http://localhost:18789/api/plugins/custom-webhook/health");
    if (resp.ok) {
      const data = await resp.json();
      console.log(`\x1b[36m  Gateway:\x1b[0m`);
      console.log(`  状态:    ✅ 运行中`);
      console.log(`  运行时间: ${Math.round(data.uptime)}s`);
      console.log("");
      console.log(`\x1b[36m  端点:\x1b[0m`);
      console.log(`  🖥  面板:    http://localhost:18789/api/plugins/custom-webhook/panel`);
      console.log(`  📋 OpenAPI: http://localhost:18789/api/plugins/custom-webhook/openapi.json`);
      console.log(`  🏥 Health:  http://localhost:18789/api/plugins/custom-webhook/health`);
      console.log(`  📨 Webhook: http://localhost:18789/api/plugins/custom-webhook/webhook`);
    }
  } catch {
    console.log(`\x1b[36m  Gateway:\x1b[0m`);
    console.log(`  状态: ❌ 未运行`);
  }
  console.log("");
}

// =========================================
// Uninstall: clean removal
// =========================================
async function uninstall() {
  console.log("");
  console.log("\x1b[1m🗑  卸载 Custom Webhook 插件\x1b[0m");
  console.log("");

  const confirm = await ask("确认卸载？(y/n) [n]: ");
  if (confirm.toLowerCase() !== "y") {
    log("已取消");
    return;
  }

  // 1. Remove plugin directory
  if (fs.existsSync(PLUGIN_DIR)) {
    fs.rmSync(PLUGIN_DIR, { recursive: true, force: true });
    ok("已删除插件目录");
  }

  // 2. Clean config
  const cfg = readConfig();
  let changed = false;

  // Remove from plugins.entries
  if (cfg.plugins?.entries?.["custom-webhook"]) {
    delete cfg.plugins.entries["custom-webhook"];
    changed = true;
  }
  // Remove from plugins.allow
  if (Array.isArray(cfg.plugins?.allow)) {
    const before = cfg.plugins.allow.length;
    cfg.plugins.allow = cfg.plugins.allow.filter(x => !x.includes("custom-webhook"));
    if (cfg.plugins.allow.length < before) changed = true;
  }
  // Remove channels config
  if (cfg.channels?.["custom-webhook"]) {
    delete cfg.channels["custom-webhook"];
    changed = true;
  }
  // Remove from plugins.installed
  if (cfg.plugins?.installed?.["custom-webhook"]) {
    delete cfg.plugins.installed["custom-webhook"];
    changed = true;
  }

  if (changed) {
    writeConfig(cfg);
    ok("已清理 openclaw.json");
  }

  // 3. Restart gateway
  const restart = await ask("是否重启 Gateway？(y/n) [y]: ");
  if (restart === "" || restart.toLowerCase() === "y") {
    try {
      execSync("openclaw gateway restart", { stdio: ["inherit", "inherit", "inherit"] });
      ok("Gateway 已重启");
    } catch {
      warn("Gateway 重启失败");
    }
  }

  console.log("");
  ok("卸载完成！");
  console.log("");
}

// =========================================
// Main
// =========================================
async function main() {
  const cmd = process.argv[2];

  try {
    switch (cmd) {
      case "install":
        await install();
        break;
      case "setup":
        await setupConfig();
        break;
      case "test":
        await test();
        break;
      case "fix-sdk":
        await fixSdk();
        break;
      case "open":
        await openPanel();
        break;
      case "status":
        await status();
        break;
      case "uninstall":
        await uninstall();
        break;
      default:
        console.log(`
\x1b[1m🦞 openclaw-custom-webhook\x1b[0m — Custom Webhook Plugin for OpenClaw

\x1b[36m安装管理:\x1b[0m
  install      一键安装（插件 + SDK + 配置 + 重启）
  uninstall    完整卸载（删除插件 + 清理配置）
  fix-sdk      修复 plugin-sdk symlink

\x1b[36m配置:\x1b[0m
  setup        配置 receiveSecret / pushUrl / pushSecret
  status       查看插件状态、配置和端点

\x1b[36m使用:\x1b[0m
  test         发送测试消息
  open         在浏览器打开 Web 测试面板

\x1b[36m用法:\x1b[0m
  npx openclaw-custom-webhook install
  npx openclaw-custom-webhook open
  npx openclaw-custom-webhook status
`);
    }
  } finally {
    closeRL();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
