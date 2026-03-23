import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import {
  readJsonWebhookBodyOrReject,
  applyBasicWebhookRequestGuards,
  registerWebhookTargetWithPluginRoute,
  resolveWebhookTargetWithAuthOrRejectSync,
  withResolvedWebhookRequestPipeline,
} from "openclaw/plugin-sdk/webhook-ingress";
import type { ResolvedCustomWebhookAccount } from "./accounts.js";
import type { CustomWebhookRuntimeEnv } from "./monitor.js";

export type CustomWebhookTarget = {
  account: ResolvedCustomWebhookAccount;
  config: OpenClawConfig;
  runtime: CustomWebhookRuntimeEnv;
  core: unknown;
  secret: string;
  path: string;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};

export type CustomWebhookUpdate = {
  senderId: string;
  senderName?: string;
  chatId: string;
  isGroup?: boolean;
  text: string;
};

export type CustomWebhookProcessUpdate = (params: {
  update: CustomWebhookUpdate;
  target: CustomWebhookTarget;
}) => Promise<void>;

const webhookTargets = new Map<string, CustomWebhookTarget[]>();

function timingSafeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    const length = Math.max(1, leftBuffer.length, rightBuffer.length);
    const paddedLeft = Buffer.alloc(length);
    const paddedRight = Buffer.alloc(length);
    leftBuffer.copy(paddedLeft);
    rightBuffer.copy(paddedRight);
    timingSafeEqual(paddedLeft, paddedRight);
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function registerCustomWebhookTarget(target: CustomWebhookTarget): () => void {
  const result = registerWebhookTargetWithPluginRoute({
    targetsByPath: webhookTargets,
    target,
    route: {
      auth: "plugin",
      match: "exact",
      path: target.path,
      pluginId: "custom-webhook",
      source: "custom-webhook-webhook",
      accountId: target.account.accountId,
      log: target.runtime.log,
      handler: async (req, res) => {
        const handled = await handleCustomWebhookRequest(req, res);
        if (!handled && !res.headersSent) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Not Found");
        }
      },
    },
  });
  return result.unregister;
}

export async function handleCustomWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const { handleCustomWebhookUpdate } = await import("./monitor.js");

  return await withResolvedWebhookRequestPipeline({
    req,
    res,
    targetsByPath: webhookTargets,
    allowMethods: ["POST"],
    handle: async ({ targets, path }) => {
      const headerToken = String(req.headers["authorization"] ?? "").replace(/^Bearer\s+/i, "");
      const target = resolveWebhookTargetWithAuthOrRejectSync({
        targets,
        res,
        isMatch: (entry) => timingSafeEquals(entry.secret, headerToken),
      });
      if (!target) {
        return true;
      }

      if (!applyBasicWebhookRequestGuards({ req, res, requireJsonContentType: true })) {
        return true;
      }

      const body = await readJsonWebhookBodyOrReject({
        req,
        res,
        maxBytes: 1024 * 1024,
        timeoutMs: 30_000,
        emptyObjectOnEmpty: false,
        invalidJsonMessage: "Bad Request",
      });
      if (!body.ok) {
        return true;
      }
      const update = body.value as CustomWebhookUpdate;

      if (!update?.senderId || !update?.text || !update?.chatId) {
        res.statusCode = 400;
        res.end("Bad Request: Missing senderId, chatId, or text");
        return true;
      }

      target.statusSink?.({ lastInboundAt: Date.now() });
      handleCustomWebhookUpdate({ update, target }).catch((err) => {
        target.runtime.error?.(
          `[${target.account.accountId}] custom-webhook failed: ${String(err)}`,
        );
      });

      res.statusCode = 200;
      res.end("ok");
      return true;
    },
  });
}
