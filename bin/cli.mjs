#!/usr/bin/env node

/**
 * openclaw-webhook CLI
 *
 * Quick setup helper for the Custom Webhook plugin.
 *
 * Usage:
 *   npx openclaw-custom-webhook setup          # interactive setup
 *   npx openclaw-custom-webhook test            # send a test message
 *   npx openclaw-custom-webhook test --url URL  # test against specific gateway
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const CONFIG_DIR = join(homedir(), ".openclaw");
const CONFIG_FILE = join(CONFIG_DIR, "openclaw.json");

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function readConfig() {
  if (!existsSync(CONFIG_FILE)) {
    console.error("❌ OpenClaw config not found at", CONFIG_FILE);
    console.error("   Run `openclaw` first to initialize.");
    process.exit(1);
  }
  return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
}

function writeConfig(cfg) {
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n");
}

async function setup() {
  console.log("\n🔧 Custom Webhook Plugin Setup\n");

  const cfg = readConfig();

  const receiveSecret = await prompt("Receive Secret (for authenticating incoming webhooks): ");
  const pushUrl = await prompt("Push URL (where to forward agent replies, leave empty to skip): ");
  const pushSecret = pushUrl ? await prompt("Push Secret (Bearer token for push URL): ") : "";

  // Add channel config
  if (!cfg.channels) cfg.channels = {};
  cfg.channels["custom-webhook"] = {
    accounts: {
      default: {
        receiveSecret: receiveSecret || `wh_${Date.now().toString(36)}`,
        ...(pushUrl ? { pushUrl, pushSecret } : {}),
      },
    },
  };

  // Add plugin config
  if (!cfg.plugins) cfg.plugins = {};
  if (!cfg.plugins.allow) cfg.plugins.allow = [];
  if (!cfg.plugins.allow.includes("custom-webhook")) {
    cfg.plugins.allow.push("custom-webhook");
  }
  if (!cfg.plugins.entries) cfg.plugins.entries = {};
  cfg.plugins.entries["custom-webhook"] = { enabled: true };

  writeConfig(cfg);

  const secret = cfg.channels["custom-webhook"].accounts.default.receiveSecret;
  console.log("\n✅ Setup complete!\n");
  console.log("Your webhook endpoint will be available at:");
  console.log("  POST http://localhost:18789/api/plugins/custom-webhook/webhook\n");
  console.log("Headers:");
  console.log(`  Authorization: Bearer ${secret}`);
  console.log(`  Content-Type: application/json\n`);
  console.log("Body example:");
  console.log('  {"senderId":"user1","chatId":"chat1","text":"Hello!"}\n');
  console.log("Restart OpenClaw gateway to activate:");
  console.log("  openclaw gateway restart\n");
}

async function test() {
  const args = process.argv.slice(3);
  let url = "http://localhost:18789";
  const urlIdx = args.indexOf("--url");
  if (urlIdx !== -1 && args[urlIdx + 1]) {
    url = args[urlIdx + 1];
  }

  const cfg = readConfig();
  const section = cfg.channels?.["custom-webhook"] ?? {};
  const accounts = section.accounts ?? {};
  const acct = accounts.default ?? section;
  const secret = acct.receiveSecret;

  if (!secret) {
    console.error("❌ No receiveSecret configured. Run: npx openclaw-custom-webhook setup");
    process.exit(1);
  }

  const webhookUrl = `${url}/api/plugins/custom-webhook/webhook`;
  console.log(`\n🧪 Sending test message to ${webhookUrl}...\n`);

  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        senderId: "cli-test-user",
        chatId: "cli-test-chat",
        text: "Hello from the CLI test!",
      }),
    });

    const data = await resp.json();

    if (resp.ok) {
      console.log("✅ Success!\n");
      console.log("Agent reply:", data.reply ?? "(no reply)");
    } else {
      console.error("❌ Failed:", resp.status, data);
    }
  } catch (err) {
    console.error("❌ Connection error:", err.message);
    console.error("   Is the OpenClaw gateway running?");
  }
  console.log();
}

function showHelp() {
  console.log(`
openclaw-webhook - Custom Webhook Channel Plugin for OpenClaw

Usage:
  npx openclaw-custom-webhook setup   Configure the webhook plugin
  npx openclaw-custom-webhook test     Send a test message
  npx openclaw-custom-webhook help     Show this help

Installation:
  openclaw plugins install openclaw-custom-webhook

Documentation:
  https://github.com/openclaw/openclaw/tree/main/extensions/custom-webhook
`);
}

const command = process.argv[2] ?? "help";

switch (command) {
  case "setup":
    await setup();
    break;
  case "test":
    await test();
    break;
  default:
    showHelp();
}
