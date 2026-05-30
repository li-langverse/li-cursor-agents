/**
 * Swarm message transport over limq (lis /v1/mq/*).
 * Dual-read: when LI_MQ_URL is unset, callers use the legacy in-process queue.
 */

export type SwarmMqEnvelope = {
  v: 1;
  id: string;
  topic: string;
  trace_id?: string;
  producer?: string;
  headers?: Record<string, string>;
  body: unknown;
  created_at?: string;
  ttl_ms?: number | null;
};

export type SwarmMqConfig = {
  baseUrl: string;
  token: string;
  consumerGroup: string;
};

const SWARM_TOPICS = [
  "swarm.commands",
  "swarm.events",
  "swarm.handoffs",
  "swarm.ci.merge",
  "swarm.dlq",
] as const;

export type SwarmTopic = (typeof SWARM_TOPICS)[number];

export function isLimqEnabled(): boolean {
  return Boolean(process.env.LI_MQ_URL?.trim());
}

export function loadSwarmMqConfig(): SwarmMqConfig | null {
  const baseUrl = process.env.LI_MQ_URL?.trim();
  const token = process.env.LI_MQ_TOKEN?.trim();
  const consumerGroup =
    process.env.LI_MQ_CONSUMER_GROUP?.trim() ||
    roleToConsumerGroup(process.env.LI_SWARM_ROLE?.trim());

  if (!baseUrl) return null;
  if (!token || !consumerGroup) {
    throw new Error(
      "LI_MQ_URL is set but LI_MQ_TOKEN and LI_MQ_CONSUMER_GROUP (or LI_SWARM_ROLE) are required",
    );
  }
  return { baseUrl, token, consumerGroup };
}

function roleToConsumerGroup(role: string | undefined): string {
  switch (role) {
    case "research":
      return "swarm-research";
    case "implement":
      return "swarm-implement";
    case "audit":
      return "swarm-audit";
    case "merge":
      return "swarm-merge";
    default:
      return "swarm-default";
  }
}

export async function mqPublish(
  topic: SwarmTopic,
  messages: Array<{ headers?: Record<string, string>; body: unknown }>,
): Promise<void> {
  const cfg = loadSwarmMqConfig();
  if (!cfg) return;

  const url = new URL("/v1/mq/publish", cfg.baseUrl);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify({ topic, messages }),
  });
  if (!res.ok) {
    throw new Error(`limq publish failed: ${res.status} ${await res.text()}`);
  }
}

export async function mqConsume(
  topic: SwarmTopic,
  opts?: { maxMessages?: number; waitMs?: number },
): Promise<SwarmMqEnvelope[]> {
  const cfg = loadSwarmMqConfig();
  if (!cfg) return [];

  const url = new URL("/v1/mq/consume", cfg.baseUrl);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify({
      topic,
      group: cfg.consumerGroup,
      max_messages: opts?.maxMessages ?? 10,
      wait_ms: opts?.waitMs ?? 30_000,
    }),
  });
  if (!res.ok) {
    throw new Error(`limq consume failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { messages?: SwarmMqEnvelope[] };
  return data.messages ?? [];
}

export async function mqAck(
  topic: SwarmTopic,
  messageId: string,
  outcome: "ack" | "nack",
): Promise<void> {
  const cfg = loadSwarmMqConfig();
  if (!cfg) return;

  const url = new URL("/v1/mq/ack", cfg.baseUrl);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify({
      topic,
      group: cfg.consumerGroup,
      message_id: messageId,
      outcome,
    }),
  });
  if (!res.ok) {
    throw new Error(`limq ack failed: ${res.status} ${await res.text()}`);
  }
}
