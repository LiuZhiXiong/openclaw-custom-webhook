/** Per-sender sliding window rate limiter. */

const DEFAULT_MAX_REQ = 30;
const DEFAULT_WINDOW_MS = 60_000; // 1 minute

const windows = new Map<string, number[]>();

export function isRateLimited(
  senderId: string,
  maxReq = DEFAULT_MAX_REQ,
  windowMs = DEFAULT_WINDOW_MS,
): boolean {
  const now = Date.now();
  const history = windows.get(senderId) ?? [];
  const recent = history.filter((t) => now - t < windowMs);
  if (recent.length >= maxReq) {
    windows.set(senderId, recent);
    return true;
  }
  recent.push(now);
  windows.set(senderId, recent);
  return false;
}

/** Return seconds until the oldest request in the window expires. */
export function retryAfterSeconds(
  senderId: string,
  windowMs = DEFAULT_WINDOW_MS,
): number {
  const history = windows.get(senderId);
  if (!history || history.length === 0) return 0;
  const oldest = Math.min(...history);
  return Math.max(1, Math.ceil((oldest + windowMs - Date.now()) / 1000));
}

/** Visible for testing. */
export function _resetRateLimiter(): void {
  windows.clear();
}
