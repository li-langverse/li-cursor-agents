/**
 * Swarm MQ transport — dual-read: LI_MQ_URL (limq) with legacy fallback.
 * ADR-li-mq-swarm-transport
 */

export const SWARM_TOPICS = {
  commands: "swarm.commands",
  events: "swarm.events",
  handoffs: "swarm.handoffs",
  ciMerge: "swarm.ci.merge",
} as const;

export type SwarmTopic = (typeof SWARM_TOPICS)[keyof typeof SWARM_TOPICS];

export interface MqPublishOptions {
  capability?: string;
  body: string | Uint8Array;
}

export interface MqConsumeResult {
  msgId: string;
  ackToken: string;
  body: string;
  topic: string;
}

function mqUrl(): string | undefined {
  const url = process.env.LI_MQ_URL?.trim();
  return url && url.length > 0 ? url.replace(/\/$/, "") : undefined;
}

/** True when limq HTTP broker should be used. */
export function isLimqEnabled(): boolean {
  return mqUrl() !== undefined;
}

async function limqFetch(
  path: string,
  init: RequestInit & { capability?: string } = {},
): Promise<Response> {
  const base = mqUrl();
  if (!base) throw new Error("LI_MQ_URL not set");
  const headers = new Headers(init.headers);
  if (init.capability) {
    headers.set("Authorization", `Capability ${init.capability}`);
  }
  return fetch(`${base}${path}`, { ...init, headers });
}

/** Publish to a swarm topic via limq. No-op when LI_MQ_URL unset (legacy path). */
export async function publishSwarmTopic(
  topic: SwarmTopic,
  options: MqPublishOptions,
): Promise<boolean> {
  const base = mqUrl();
  if (!base) return false;
  const body =
    typeof options.body === "string"
      ? new TextEncoder().encode(options.body)
      : options.body;
  const res = await limqFetch(`/v1/topics/${encodeURIComponent(topic)}/publish`, {
    method: "POST",
    body,
    capability: options.capability,
  });
  return res.ok;
}

/** Consume from a swarm topic via limq. Returns null when LI_MQ_URL unset. */
export async function consumeSwarmTopic(
  topic: SwarmTopic,
  group: string,
  capability?: string,
): Promise<MqConsumeResult | null> {
  if (!mqUrl()) return null;
  const res = await limqFetch(
    `/v1/topics/${encodeURIComponent(topic)}/consume?group=${encodeURIComponent(group)}`,
    { method: "POST", capability },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as MqPublishOptions & {
    msg_id?: string;
    ack_token?: string;
    topic?: string;
  };
  return {
    msgId: String(json.msg_id ?? ""),
    ackToken: String(json.ack_token ?? ""),
    body: typeof json.body === "string" ? json.body : "",
    topic: String(json.topic ?? topic),
  };
}

/** Legacy in-memory handoff queue (fallback when LI_MQ_URL unset). */
const legacyHandoffs: Array<{ topic: string; body: string }> = [];

export function legacyEnqueue(topic: string, body: string): void {
  legacyHandoffs.push({ topic, body });
}

export function legacyDequeue(topic: string): { body: string } | undefined {
  const idx = legacyHandoffs.findIndex((h) => h.topic === topic);
  if (idx < 0) return undefined;
  const [row] = legacyHandoffs.splice(idx, 1);
  return { body: row.body };
}

/** Dual-read publish: limq when configured, else legacy queue. */
export async function swarmPublish(
  topic: SwarmTopic,
  body: string,
  capability?: string,
): Promise<void> {
  const sent = await publishSwarmTopic(topic, { body, capability });
  if (!sent) legacyEnqueue(topic, body);
}

/** Dual-read consume: limq when configured, else legacy queue. */
export async function swarmConsume(
  topic: SwarmTopic,
  group: string,
  capability?: string,
): Promise<{ body: string } | null> {
  const mq = await consumeSwarmTopic(topic, group, capability);
  if (mq) return { body: mq.body };
  return legacyDequeue(topic) ?? null;
}
