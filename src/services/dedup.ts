/** Message deduplication using a TTL-based in-memory cache. */

const recentMessageIds = new Map<string, number>();
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function isDuplicate(id: string): boolean {
  const now = Date.now();
  // Cleanup expired entries
  for (const [k, t] of recentMessageIds) {
    if (now - t > DEDUP_TTL_MS) recentMessageIds.delete(k);
  }
  if (recentMessageIds.has(id)) return true;
  recentMessageIds.set(id, now);
  return false;
}

/** Visible for testing. */
export function _resetDedup(): void {
  recentMessageIds.clear();
}
