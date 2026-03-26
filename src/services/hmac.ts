/** HMAC-SHA256 request signature verification with timestamp replay protection. */
import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Verify an HMAC-SHA256 signature on an incoming webhook request.
 *
 * The signature is computed as: HMAC-SHA256(hmacSecret, `${timestamp}.${body}`)
 *
 * @param body       Raw request body string
 * @param signature  Value of X-Webhook-Signature header (hex-encoded)
 * @param timestamp  Value of X-Webhook-Timestamp header (Unix ms string)
 * @param secret     The hmacSecret from config
 * @param toleranceMs  Max allowed age of the timestamp (default 5 min)
 * @returns true if valid, false if invalid
 */
export function verifyHmac(
  body: string,
  signature: string,
  timestamp: string,
  secret: string,
  toleranceMs = DEFAULT_TOLERANCE_MS,
): boolean {
  // 1. Timestamp freshness check
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() - ts) > toleranceMs) return false;

  // 2. HMAC verification (timing-safe comparison)
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * Compute an HMAC-SHA256 signature for an outbound push payload.
 * Returns the hex-encoded signature string and a timestamp.
 */
export function signPayload(
  body: string,
  secret: string,
): { signature: string; timestamp: string } {
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return { signature, timestamp };
}
