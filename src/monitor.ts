import { createChannelPairingController } from "openclaw/plugin-sdk/channel-pairing";
import { createChannelReplyPipeline } from "openclaw/plugin-sdk/channel-reply-pipeline";
import { resolveSenderCommandAuthorizationWithRuntime } from "openclaw/plugin-sdk/command-auth";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { waitForAbortSignal } from "openclaw/plugin-sdk/runtime-env";
import { resolveWebhookPath } from "openclaw/plugin-sdk/webhook-path";
import type { ResolvedCustomWebhookAccount } from "./accounts.js";
import {
  resolveDirectDmAuthorizationOutcome,
  resolveInboundRouteEnvelopeBuilderWithRuntime,
} from "./helpers.js";
import {
  registerCustomWebhookTarget,
  type CustomWebhookTarget,
  type CustomWebhookUpdate,
} from "./monitor.webhook.js";
import { getCustomWebhookRuntime } from "./runtime.js";

export type CustomWebhookRuntimeEnv = {
  log?: (message: string) => void;
  error?: (message: string) => void;
};

export type CustomWebhookMonitorOptions = {
  account: ResolvedCustomWebhookAccount;
  config: OpenClawConfig;
  runtime: CustomWebhookRuntimeEnv;
  abortSignal: AbortSignal;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};

export async function handleCustomWebhookUpdate(params: {
  update: CustomWebhookUpdate;
  target: CustomWebhookTarget;
}): Promise<void> {
  const { update, target } = params;
  const { account, config, runtime, statusSink } = target;
  const core = getCustomWebhookRuntime();

  const isGroup = Boolean(update.isGroup);
  const chatId = String(update.chatId);
  const senderId = String(update.senderId);
  const senderName = update.senderName || undefined;
  const rawBody = update.text;

  const pairing = createChannelPairingController({
    core,
    channel: "custom-webhook",
    accountId: account.accountId,
  });

  const dmPolicy = account.config.dmPolicy ?? "pairing";
  const configAllowFrom = (account.config.allowFrom ?? []).map((v) => String(v));
  const configuredGroupAllowFrom = (account.config.groupAllowFrom ?? []).map((v) => String(v));
  const groupAllowFrom =
    configuredGroupAllowFrom.length > 0 ? configuredGroupAllowFrom : configAllowFrom;

  const { senderAllowedForCommands, commandAuthorized } =
    await resolveSenderCommandAuthorizationWithRuntime({
      cfg: config,
      rawBody,
      isGroup,
      dmPolicy,
      configuredAllowFrom: configAllowFrom,
      configuredGroupAllowFrom: groupAllowFrom,
      senderId,
      isSenderAllowed: (id, allowFrom) => allowFrom.includes(id),
      readAllowFromStore: pairing.readAllowFromStore,
      runtime: core.channel.commands,
    });

  const directDmOutcome = resolveDirectDmAuthorizationOutcome({
    isGroup,
    dmPolicy,
    senderAllowedForCommands,
  });

  if (directDmOutcome === "disabled") {
    runtime.log?.(`Blocked custom-webhook DM from ${senderId} (dmPolicy=disabled)`);
    return;
  }
  if (directDmOutcome === "unauthorized") {
    if (dmPolicy === "pairing") {
      await pairing.issueChallenge({
        senderId,
        senderIdLine: `Your custom-webhook user id: ${senderId}`,
        meta: { name: senderName },
        onCreated: () => {
          runtime.log?.(`custom-webhook pairing request sender=${senderId}`);
        },
        sendPairingReply: async (text) => {
          const { sendCustomWebhookText } = await import("./channel.runtime.js");
          await sendCustomWebhookText({
            to: chatId,
            text,
            accountId: account.accountId,
            cfg: config,
          });
          statusSink?.({ lastOutboundAt: Date.now() });
        },
        onReplyError: (err) => {
          runtime.error?.(`custom-webhook pairing reply failed for ${senderId}: ${String(err)}`);
        },
      });
    } else {
      runtime.log?.(
        `Blocked unauthorized custom-webhook sender ${senderId} (dmPolicy=${dmPolicy})`,
      );
    }
    return;
  }

  const { route, buildEnvelope } = resolveInboundRouteEnvelopeBuilderWithRuntime({
    cfg: config,
    channel: "custom-webhook",
    accountId: account.accountId,
    peer: {
      kind: isGroup ? ("group" as const) : ("direct" as const),
      id: chatId,
    },
    runtime: core.channel,
    sessionStore: config.session?.store,
  });

  if (
    isGroup &&
    core.channel.commands.isControlCommandMessage(rawBody, config) &&
    commandAuthorized !== true
  ) {
    runtime.log?.(`custom-webhook: drop control command from unauthorized sender ${senderId}`);
    return;
  }

  const fromLabel = isGroup ? `group:${chatId}` : senderName || `user:${senderId}`;
  const { storePath, body } = buildEnvelope({
    channel: "Custom Webhook",
    from: fromLabel,
    timestamp: Date.now(),
    body: rawBody,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: rawBody,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: isGroup ? `cwh:group:${chatId}` : `cwh:${senderId}`,
    To: `cwh:${chatId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "group" : "direct",
    ConversationLabel: fromLabel,
    SenderName: senderName,
    SenderId: senderId,
    CommandAuthorized: commandAuthorized,
    Provider: "custom-webhook",
    Surface: "custom-webhook",
    MessageSid: `${Date.now()}-${Math.random()}`,
    OriginatingChannel: "custom-webhook",
    OriginatingTo: `cwh:${chatId}`,
  });

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      runtime.error?.(`custom-webhook: failed updating session meta: ${String(err)}`);
    },
  });

  const { onModelSelected, ...replyPipeline } = createChannelReplyPipeline({
    cfg: config,
    agentId: route.agentId,
    channel: "custom-webhook",
    accountId: account.accountId,
    typing: {
      start: async () => {},
      onStartError: () => {},
    },
  });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      ...replyPipeline,
      deliver: async (payload) => {
        const { sendCustomWebhookText } = await import("./channel.runtime.js");
        if (payload.text) {
          await sendCustomWebhookText({
            to: chatId,
            text: payload.text,
            accountId: account.accountId,
            cfg: config,
          });
          statusSink?.({ lastOutboundAt: Date.now() });
        }
      },
      onError: (err, info) => {
        runtime.error?.(
          `[${account.accountId}] custom-webhook ${info.kind} reply failed: ${String(err)}`,
        );
      },
    },
    replyOptions: {
      onModelSelected,
    },
  });
}

export async function monitorCustomWebhookProvider(
  options: CustomWebhookMonitorOptions,
): Promise<void> {
  const { account, config, runtime, abortSignal, statusSink } = options;
  const core = getCustomWebhookRuntime();

  const { receiveSecret, webhookPath } = account.config;
  const path =
    resolveWebhookPath({ webhookPath, webhookUrl: "", defaultPath: "/webhook" }) || "/webhook";

  runtime.log?.(`[${account.accountId}] Custom webhook registered path=${path}`);

  const unregister = registerCustomWebhookTarget({
    account,
    config,
    runtime,
    core,
    path,
    secret: receiveSecret,
    statusSink,
  });

  try {
    await waitForAbortSignal(abortSignal);
  } finally {
    unregister();
    runtime.log?.(`[${account.accountId}] Custom webhook provider stopped`);
  }
}
