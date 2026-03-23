import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setCustomWebhookRuntime(r: PluginRuntime) {
  runtime = r;
}

export function getCustomWebhookRuntime(): PluginRuntime {
  if (!runtime) throw new Error("Custom webhook runtime not initialized");
  return runtime;
}
