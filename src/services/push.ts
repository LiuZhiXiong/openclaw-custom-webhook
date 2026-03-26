/** Push with retry — 3 attempts, exponential backoff (1s, 2s, 4s). */

import { signPayload } from "./hmac.ts";

interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

const MAX_ATTEMPTS = 3;

export async function pushWithRetry(
  url: string,
  secret: string,
  payload: Record<string, unknown>,
  logger: Logger,
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const bodyStr = JSON.stringify(payload);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (secret) {
        headers["Authorization"] = `Bearer ${secret}`;
        // HMAC-SHA256 signature for tamper-proof verification
        const { signature, timestamp } = signPayload(bodyStr, secret);
        headers["X-Signature"] = `sha256=${signature}`;
        headers["X-Timestamp"] = timestamp;
      }

      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: bodyStr,
      });
      if (resp.ok) {
        logger.info(`[custom-webhook] Push success (attempt ${attempt})`);
        return;
      }
      logger.warn(`[custom-webhook] Push HTTP ${resp.status} (attempt ${attempt}/${MAX_ATTEMPTS})`);
    } catch (err) {
      logger.warn(`[custom-webhook] Push error (attempt ${attempt}/${MAX_ATTEMPTS}): ${err}`);
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
  }
  logger.warn(`[custom-webhook] Push failed after ${MAX_ATTEMPTS} attempts`);
}
