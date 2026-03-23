import {
  createAccountListHelpers,
  resolveMergedAccountConfig,
} from "openclaw/plugin-sdk/account-helpers";
export type PluginChannelAccount = { accountId: string; name?: string; enabled: boolean };
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { CustomWebhookConfig, CustomWebhookAccountConfig } from "./config-schema.js";

export const DEFAULT_ACCOUNT_ID = "custom-webhook";

export type ResolvedCustomWebhookAccount = PluginChannelAccount & {
  config: CustomWebhookConfig;
  enabled: boolean;
};

export function resolveCustomWebhookAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string;
}): ResolvedCustomWebhookAccount {
  const accountId = params.accountId || DEFAULT_ACCOUNT_ID;
  const channelBase = (params.cfg.channels?.["custom-webhook"] || {}) as CustomWebhookConfig;
  const config = resolveMergedAccountConfig<CustomWebhookAccountConfig>({
    channelConfig: channelBase as CustomWebhookAccountConfig,
    accounts: channelBase.accounts,
    accountId,
  });
  const enabled =
    Boolean(config.receiveSecret) && channelBase.enabled !== false && config.enabled !== false;

  return {
    accountId,
    name: config.name?.trim() || "Custom Webhook",
    enabled,
    config,
  };
}

const { listAccountIds } = createAccountListHelpers("custom-webhook");

export function listCustomWebhookAccountIds(params: { cfg: OpenClawConfig }): string[] {
  return listAccountIds(params.cfg);
}

export function resolveDefaultCustomWebhookAccountId(params: { cfg: OpenClawConfig }): string {
  return DEFAULT_ACCOUNT_ID;
}
