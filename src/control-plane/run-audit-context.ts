/** How completion audit treats PR/deliverable gaps (production vs verify vs digest-only). */
export type CompletionMode = "production" | "verify" | "digest_only";

export interface RunAuditContext {
  mode: CompletionMode;
  skipPush: boolean;
  smokeRun: boolean;
  /** Post-hook push failed when push was required. */
  postHookPushFailed?: boolean;
  postHookError?: string;
}

export function resolveRunAuditContext(overrides?: Partial<RunAuditContext>): RunAuditContext {
  const verify =
    process.env.LI_AGENT_VERIFY_MODE === "1" || process.env.LI_AGENT_VERIFY_MODE === "true";
  const skipPush =
    process.env.LI_REPO_WORKFLOW_SKIP_PUSH === "1" ||
    process.env.LI_REPO_WORKFLOW_SKIP_PUSH === "true";
  const smoke =
    process.env.LI_REPO_WORKFLOW_SMOKE === "1" || process.env.LI_REPO_WORKFLOW_SMOKE === "true";

  let mode: CompletionMode = "production";
  if (verify) mode = "verify";
  else if (skipPush && !smoke) mode = "digest_only";

  return {
    mode: overrides?.mode ?? mode,
    skipPush: overrides?.skipPush ?? skipPush,
    smokeRun: overrides?.smokeRun ?? smoke,
    postHookPushFailed: overrides?.postHookPushFailed,
    postHookError: overrides?.postHookError,
  };
}

/** Status recorded for cooldown / anti-cycle (verify digests should not block the queue). */
export function statusForTaskCooldown(result: {
  status: string;
  completion?: { completion_mode?: CompletionMode; premature?: boolean };
}): string {
  const mode = result.completion?.completion_mode;
  if (
    result.status === "incomplete" &&
    (mode === "verify" || mode === "digest_only") &&
    !result.completion?.premature
  ) {
    return "finished";
  }
  return result.status;
}
