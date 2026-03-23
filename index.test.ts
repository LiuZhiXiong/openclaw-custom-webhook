import { describe, it, expect, vi } from "vitest";
import { customWebhookPlugin } from "./src/channel.js";

describe("Custom Webhook Plugin", () => {
  it("should define plugin correctly", () => {
    expect(customWebhookPlugin.id).toBe("custom-webhook");
    expect(customWebhookPlugin.capabilities.chatTypes).toContain("group");
  });
});
