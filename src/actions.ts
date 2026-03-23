import type { ChannelMessageActionAdapter } from "openclaw/plugin-sdk/index";

export const customWebhookMessageActions: ChannelMessageActionAdapter = {
  describeMessageTool: () => null,
  extractToolSend: () => undefined,
  handleAction: async () => {
    throw new Error("Actions not supported for custom-webhook");
  },
};
