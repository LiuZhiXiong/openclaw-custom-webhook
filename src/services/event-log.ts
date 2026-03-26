/** Webhook event log — in-memory ring buffer for debugging. */

export interface WebhookEvent {
  id: string;
  type: "inbound" | "outbound" | "push" | "error";
  senderId?: string;
  chatId?: string;
  status?: number;
  latencyMs?: number;
  error?: string;
  timestamp: number;
}

const MAX_EVENTS = 100;
const events: WebhookEvent[] = [];

export function recordEvent(event: Omit<WebhookEvent, "id">): void {
  const entry: WebhookEvent = {
    ...event,
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  };
  events.push(entry);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
}

export function getEvents(limit = MAX_EVENTS): WebhookEvent[] {
  return events.slice(-limit);
}

export function clearEvents(): number {
  const count = events.length;
  events.length = 0;
  return count;
}
