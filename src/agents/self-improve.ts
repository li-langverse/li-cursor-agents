import type { AgentDefinition } from "../types.js";

export const SELF_IMPROVE_AGENT: AgentDefinition = {
  id: "self_improve" as any,
  name: "Self-improvement reflector",
  promptFile: "self-improve.md",
  skills: [],
  needsWeb: false,
  preflightKeys: ["briefing"],
};
