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

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); }));
}

function log(msg) { console.log(`\x1b[36m[custom-webhook]\x1b[0m ${msg}`); }
function ok(msg)  { console.log(`\x1b[32m✅\x1b[0m ${msg}`); }
function warn(msg){ console.log(`\x1b[33m⚠️\x1b[0m  ${msg}`); }
function err(msg) { console.log(`\x1b[31m❌\x1b[0m ${msg}`); }

// =========================================
// Find OpenClaw installation
// =========================================
function findOpenClawRoot() {
  // 1. npm global
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    const p = path.join(globalRoot, "openclaw");
    if (fs.existsSync(path.join(p, "package.json"))) return p;
  } catch {}

  // 2. which openclaw -> resolve
  try {
    const bin = execSync("which openclaw", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    let realBin = bin;
    try { realBin = fs.realpathSync(bin); } catch {}
    let cursor = path.dirname(realBin);
    for (let i = 0; i < 8; i++) {
      const pkgPath = path.join(cursor, "package.json");
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
          if (pkg.name === "openclaw") return cursor;
        } catch {}
      }
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
  } catch {}

  // 3. Common paths
  for (const p of [
    "/usr/lib/node_modules/openclaw",
    "/usr/local/lib/node_modules/openclaw",
    path.join(os.homedir(), ".npm-global/lib/node_modules/openclaw"),
  ]) {
    if (fs.existsSync(path.join(p, "package.json"))) return p;
  }

  return null;
}

// =========================================
// Create symlink for plugin-sdk
// =========================================
function fixSdk() {
  log("查找 OpenClaw 安装位置...");
  const root = findOpenClawRoot();
  if (!root) {
    err("找不到 OpenClaw 安装位置！请确认已安装: npm install -g openclaw");
    return false;
  }
  ok(`找到 OpenClaw: ${root}`);

  const nodeModulesDir = path.join(PLUGIN_DIR, "node_modules");
  const link = path.join(nodeModulesDir, "openclaw");

  // Check existing
  try {
    const existing = fs.readlinkSync(link);
    if (existing === root) {
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

  const receiveSecret = await ask(
    `接收密钥 (receiveSecret) [${existing.receiveSecret ? "***已配置***" : "必填"}]: `
  );
  const pushUrl = await ask(
    `推送地址 (pushUrl, 留空跳过) [${existing.pushUrl || "未配置"}]: `
  );
  const pushSecret = pushUrl
    ? await ask(`推送密钥 (pushSecret, 留空跳过) [${existing.pushSecret || "未配置"}]: `)
    : "";

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
  fixSdk();
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
  console.log("=".repeat(40));
  ok("安装完成！");
  console.log("");
  console.log("发送测试消息:");
  const secret = readConfig().channels?.["custom-webhook"]?.accounts?.default?.receiveSecret ?? "YOUR_SECRET";
  console.log(`  curl -X POST http://localhost:18789/api/plugins/custom-webhook/webhook \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -H "Authorization: Bearer ${secret}" \\`);
  console.log(`    -d '{"senderId":"test","text":"hello"}'`);
  console.log("");
  console.log("或运行: npx openclaw-custom-webhook test");
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
// Main
// =========================================
const cmd = process.argv[2];

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
    fixSdk();
    break;
  default:
    console.log(`
openclaw-custom-webhook - Custom Webhook Plugin for OpenClaw

命令:
  install    一键安装（安装插件 + SDK修复 + 配置 + 重启）
  setup      仅配置 receiveSecret / pushUrl
  test       发送测试消息
  fix-sdk    修复 plugin-sdk symlink

用法:
  npx openclaw-custom-webhook install
  npx openclaw-custom-webhook setup
  npx openclaw-custom-webhook test
  npx openclaw-custom-webhook fix-sdk
`);
}
