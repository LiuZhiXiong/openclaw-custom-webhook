#!/usr/bin/env node

/**
 * postinstall script: creates a symlink from this plugin's node_modules/openclaw       
 * to the actual OpenClaw installation so that `openclaw/plugin-sdk` imports resolve.
 *
 * OpenClaw's jiti alias normally handles this, but only when the OpenClaw package root
 * is a parent directory of the plugin. For global installs or ~/.openclaw/extensions,
 * the alias traversal may not find the package root. This symlink fixes that.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..");
const nodeModulesDir = path.join(pluginRoot, "node_modules");
const openclawLink = path.join(nodeModulesDir, "openclaw");

// Skip if already exists
if (fs.existsSync(openclawLink)) {
  process.exit(0);
}

// Try to find the openclaw package root
function findOpenClawRoot() {
  // 1. Check if openclaw is globally installed
  try {
    const globalPrefix = execSync("npm root -g", { encoding: "utf-8" }).trim();
    const globalOpenclaw = path.join(globalPrefix, "openclaw");
    if (fs.existsSync(path.join(globalOpenclaw, "package.json"))) {
      return globalOpenclaw;
    }
  } catch {}

  // 2. Check common global paths
  const commonPaths = [
    "/usr/lib/node_modules/openclaw",
    "/usr/local/lib/node_modules/openclaw",
    path.join(process.env.HOME || "~", ".npm-global/lib/node_modules/openclaw"),
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(path.join(p, "package.json"))) {
      return p;
    }
  }

  // 3. Try `which openclaw` and resolve from there
  try {
    const bin = execSync("which openclaw", { encoding: "utf-8" }).trim();
    const realBin = fs.realpathSync(bin);
    // Typically: <prefix>/lib/node_modules/openclaw/dist/cli.js or similar
    let cursor = path.dirname(realBin);
    for (let i = 0; i < 6; i++) {
      if (fs.existsSync(path.join(cursor, "package.json"))) {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(cursor, "package.json"), "utf-8"));
          if (pkg.name === "openclaw" && pkg.exports?.["./plugin-sdk"]) {
            return cursor;
          }
        } catch {}
      }
      cursor = path.dirname(cursor);
    }
  } catch {}

  // 4. Walk up from the plugin directory (works when plugin is inside the openclaw source tree)
  let cursor = pluginRoot;
  for (let i = 0; i < 12; i++) {
    const pkgPath = path.join(cursor, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg.name === "openclaw" && pkg.exports?.["./plugin-sdk"]) {
          return cursor;
        }
      } catch {}
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  return null;
}

const openclawRoot = findOpenClawRoot();
if (!openclawRoot) {
  console.warn(
    "[custom-webhook] Warning: Could not find OpenClaw installation.\n" +
    "  The plugin-sdk imports may not resolve at runtime.\n" +
    "  Make sure OpenClaw is installed: npm install -g openclaw\n" +
    "  Then reinstall this plugin: openclaw plugins install openclaw-custom-webhook"
  );
  process.exit(0);
}

// Create node_modules dir and symlink
fs.mkdirSync(nodeModulesDir, { recursive: true });
try {
  fs.symlinkSync(openclawRoot, openclawLink, "dir");
  console.log(`[custom-webhook] Linked openclaw → ${openclawRoot}`);
} catch (err) {
  // Symlink might fail on some systems, try copy instead
  try {
    // Just copy the package.json and relevant dirs
    fs.mkdirSync(openclawLink, { recursive: true });
    fs.copyFileSync(
      path.join(openclawRoot, "package.json"),
      path.join(openclawLink, "package.json")
    );
    // Copy/link the plugin-sdk directories
    for (const dir of ["src/plugin-sdk", "dist/plugin-sdk"]) {
      const srcDir = path.join(openclawRoot, dir);
      const dstDir = path.join(openclawLink, dir);
      if (fs.existsSync(srcDir)) {
        fs.mkdirSync(path.dirname(dstDir), { recursive: true });
        fs.symlinkSync(srcDir, dstDir, "dir");
      }
    }
    console.log(`[custom-webhook] Copied openclaw SDK from ${openclawRoot}`);
  } catch (copyErr) {
    console.warn(`[custom-webhook] Warning: Could not link openclaw: ${copyErr.message}`);
  }
}
