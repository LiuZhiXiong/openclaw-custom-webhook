import { z } from "zod";

export const CustomWebhookConfigSchema = z
  .object({
    receiveSecret: z
      .string()
      .min(1)
      .describe("Secret token for authenticating incoming webhook requests to OpenClaw."),
    pushUrl: z.string().url().describe("The URL where OpenClaw will push outgoing messages."),
    pushSecret: z
      .string()
      .optional()
      .describe("Optional secret token included in Outgoing push requests."),
    allowFrom: z.array(z.string()).optional().describe("Allowed sender IDs or numbers."),
    groupPolicy: z
      .enum(["allowlist", "open", "disabled"])
      .optional()
      .describe("Policy for handling group messages."),
    groupAllowFrom: z.array(z.string()).optional().describe("Allowed group IDs."),
    dmPolicy: z
      .enum(["pairing", "allowlist", "open", "disabled"])
      .optional()
      .describe("Policy for handling distinct users/DMs."),
    webhookPath: z.string().optional().describe("Custom webhook path (default: /webhook)."),
  })
  .passthrough();

export type CustomWebhookConfig = z.infer<typeof CustomWebhookConfigSchema>;
