import type { IncomingMessage, ServerResponse } from "node:http";
import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk";
import { getCustomWebhookRuntime } from "./runtime.js";

const DEFAULT_ACCOUNT_ID = "default";
const WEBHOOK_PATH = "/api/plugins/custom-webhook/webhook";

interface ResolvedWebhookAccount {
  accountId: string;
  enabled: boolean;
  receiveSecret: string;
  pushUrl: string;
  pushSecret: string;
}

function resolveAccount(cfg: OpenClawConfig, accountId?: string): ResolvedWebhookAccount {
  const id = accountId || DEFAULT_ACCOUNT_ID;
  const section = (cfg.channels as any)?.["custom-webhook"] ?? {};
  const accounts = section.accounts ?? {};
  const acct = accounts[id] ?? section;
  return {
    accountId: id,
    enabled: acct.enabled !== false,
    receiveSecret: acct.receiveSecret ?? "",
    pushUrl: acct.pushUrl ?? "",
    pushSecret: acct.pushSecret ?? "",
  };
}

function listAccountIds(cfg: OpenClawConfig): string[] {
  const section = (cfg.channels as any)?.["custom-webhook"] ?? {};
  const accounts = section.accounts ?? {};
  const ids = Object.keys(accounts);
  return ids.length > 0 ? ids : [DEFAULT_ACCOUNT_ID];
}

async function pushToExternalService(account: ResolvedWebhookAccount, payload: any) {
  if (!account.pushUrl) return;
  try {
    const resp = await fetch(account.pushUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(account.pushSecret ? { Authorization: `Bearer ${account.pushSecret}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      console.error(`[custom-webhook] push failed: ${resp.status} ${resp.statusText}`);
    }
  } catch (err) {
    console.error(`[custom-webhook] push error: ${err}`);
  }
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

export const customWebhookPlugin: ChannelPlugin = {
  id: "custom-webhook",
  meta: {
    displayName: "Custom Webhook",
    description: "HTTP webhook channel for external integrations",
  },
  accounts: {
    resolveAccountId: ({ accountId }) => accountId?.trim() || DEFAULT_ACCOUNT_ID,
    listAccountIds: ({ cfg }) => listAccountIds(cfg),
    resolveAccountSnapshot: ({ cfg, accountId }) => {
      const account = resolveAccount(cfg, accountId);
      return {
        accountId: account.accountId,
        enabled: account.enabled,
        configured: Boolean(account.receiveSecret),
        running: false,
        connected: false,
      };
    },
  },
  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4096,
    sendText: async ({ to, text, accountId, cfg }) => {
      const account = resolveAccount(cfg, accountId);
      await pushToExternalService(account, {
        type: "reply",
        to,
        text,
        timestamp: Date.now(),
      });
      return {
        channel: "custom-webhook",
        messageId: `wh-${Date.now()}`,
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const { account, abortSignal, log, cfg } = ctx;
      const resolved = resolveAccount(cfg, account.accountId);

      if (!resolved.receiveSecret) {
        log?.warn?.(`[custom-webhook:${account.accountId}] No receiveSecret configured, skipping`);
        return;
      }

      log?.info?.(`[custom-webhook:${account.accountId}] Webhook ready at ${WEBHOOK_PATH}`);

      const runtime = getCustomWebhookRuntime();

      // Register HTTP route for receiving webhooks
      const api = runtime as any;
      if (typeof api.channel?.registerHttpRoute === "function") {
        api.channel.registerHttpRoute({
          method: "POST",
          path: WEBHOOK_PATH,
          handler: async (req: IncomingMessage, res: ServerResponse) => {
            try {
              // Verify authorization
              const authHeader = req.headers.authorization ?? "";
              const token = authHeader.replace(/^Bearer\s+/i, "");
              if (token !== resolved.receiveSecret) {
                res.writeHead(401, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Unauthorized" }));
                return;
              }

              const bodyStr = await readBody(req);
              const body = JSON.parse(bodyStr);

              log?.info?.(`[custom-webhook] Received: ${JSON.stringify(body)}`);

              // Push to external service as acknowledgment
              await pushToExternalService(resolved, {
                type: "received",
                originalMessage: body,
                timestamp: Date.now(),
              });

              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: true, received: true }));
            } catch (err) {
              log?.error?.(`[custom-webhook] Handler error: ${err}`);
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Internal error" }));
            }
          },
        });
      }

      // Wait until abort
      await new Promise<void>((resolve) => {
        if (abortSignal?.aborted) {
          resolve();
          return;
        }
        abortSignal?.addEventListener("abort", () => resolve(), { once: true });
      });
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      connected: false,
      lastConnectedAt: null,
      lastError: null,
      lastInboundAt: null,
      lastOutboundAt: null,
    },
    buildAccountSnapshot: ({ account, runtime }: any) => ({
      accountId: account?.accountId ?? DEFAULT_ACCOUNT_ID,
      enabled: account?.enabled ?? false,
      configured: Boolean(account?.receiveSecret),
      running: runtime?.running ?? false,
      connected: runtime?.connected ?? false,
    }),
  },
};
