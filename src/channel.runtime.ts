import { createAccountStatusSink } from "openclaw/plugin-sdk/channel-lifecycle";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { ChannelPlugin } from "openclaw/plugin-sdk/index";
import { fetch } from "undici";
import { resolveCustomWebhookAccount } from "./accounts.js";

export async function notifyCustomWebhookPairingApproval(params: {
  cfg: OpenClawConfig;
  id: string;
}) {
  const account = resolveCustomWebhookAccount({ cfg: params.cfg });
  if (!account.config.pushUrl) {
    throw new Error("Custom webhook pushUrl not configured");
  }
  await sendCustomWebhookText({
    to: params.id,
    text: "Your pairing request has been approved.",
    accountId: account.accountId,
    cfg: params.cfg,
  });
}

export async function sendCustomWebhookText(params: {
  to: string;
  text: string;
  accountId?: string;
  cfg: OpenClawConfig;
}) {
  const account = resolveCustomWebhookAccount({ cfg: params.cfg, accountId: params.accountId });
  if (!account.config.pushUrl) {
    throw new Error(
      `[${account.accountId}] custom webhook configured without pushUrl; dropping outbound message`,
    );
  }

  const { pushUrl, pushSecret } = account.config;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (pushSecret) {
    headers["Authorization"] = `Bearer ${pushSecret}`;
  }

  const res = await fetch(pushUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      to: params.to,
      text: params.text,
    }),
  });

  if (!res.ok) {
    throw new Error(`Custom webhook push failed: HTTP ${res.status} ${res.statusText}`);
  }
}

export async function startCustomWebhookGatewayAccount(
  ctx: Parameters<NonNullable<NonNullable<ChannelPlugin["gateway"]>["startAccount"]>>[0],
) {
  const account = ctx.account as ReturnType<typeof resolveCustomWebhookAccount>;
  const { receiveSecret } = account.config;

  if (!receiveSecret) {
    throw new Error(`[${account.accountId}] receiveSecret is required`);
  }

  ctx.setStatus({
    accountId: account.accountId,
    bot: { name: "Custom Webhook Bot" },
  });

  const statusSink = createAccountStatusSink({
    accountId: ctx.accountId,
    setStatus: ctx.setStatus,
  });

  ctx.log?.info(`[${account.accountId}] starting custom webhook provider...`);

  const { monitorCustomWebhookProvider } = await import("./monitor.js");
  return monitorCustomWebhookProvider({
    account,
    config: ctx.cfg,
    runtime: ctx.runtime,
    abortSignal: ctx.abortSignal,
    statusSink,
  });
}
