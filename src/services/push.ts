/** Push with retry — 3 attempts, exponential backoff (1s, 2s, 4s). */

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
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify(payload),
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
