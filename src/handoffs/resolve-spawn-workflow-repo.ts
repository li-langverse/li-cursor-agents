import { listHandoffs } from "./handoff-store.js";
import { resolveGoalImplementationRepo } from "./goal-workflow.js";
import { handoffReadyForImplement } from "./placement-validator.js";
import type { AgentId } from "../types.js";

/** Next claimable goal handoff → workflow repo for manual/dashboard spawns. */
export async function resolveSpawnWorkflowRepo(agentId: AgentId | string): Promise<string | undefined> {
  if (agentId !== "code_implementer") return undefined;
  const rows = await listHandoffs({
    status: ["pending", "claimed"],
    toAgent: "code_implementer",
    limit: 10,
  });
  for (const h of rows) {
    if (!handoffReadyForImplement(h)) continue;
    const explicit =
      typeof h.work?.target_repo === "string" ? h.work.target_repo.trim() : undefined;
    if (explicit) return explicit;
    const repo = resolveGoalImplementationRepo(h);
    if (repo) return repo;
  }
  return undefined;
}
