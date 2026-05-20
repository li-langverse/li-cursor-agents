export interface ClassifiedGitError {
  code: string;
  message: string;
  hint: string;
}

/** Turn git/gh stderr into operator-actionable errors (Cloud cursor[bot] vs GH_TOKEN). */
export function classifyGitRemoteError(stderr: string, stdout = ""): ClassifiedGitError {
  const text = `${stderr}\n${stdout}`.trim();
  if (/denied to cursor\[bot\]|cursor\[bot\].*403/i.test(text)) {
    return {
      code: "git_auth_cursor_bot",
      message: "Push rejected: git used cursor[bot] credentials instead of GH_TOKEN",
      hint:
        "Ensure gitPushBranch runs with GH_TOKEN set, or unset global git url.insteadof rules. See src/repo-workflow/git.ts.",
    };
  }
  if (/403|Permission to .+ denied/i.test(text)) {
    return {
      code: "git_push_forbidden",
      message: text.split("\n")[0] || "git push forbidden",
      hint: "Check GH_TOKEN has write access to the target repo.",
    };
  }
  if (/GH_TOKEN missing|cannot push or open PR/i.test(text)) {
    return {
      code: "git_token_missing",
      message: text.split("\n")[0] || "missing GitHub token",
      hint: "Set GH_TOKEN in .env.github or the environment.",
    };
  }
  if (/already exists|A pull request already exists/i.test(text)) {
    return {
      code: "pr_already_exists",
      message: "Pull request already exists for this branch",
      hint: "Reuse the open PR URL instead of creating a duplicate.",
    };
  }
  return {
    code: "git_remote_error",
    message: text.slice(0, 500) || "git remote operation failed",
    hint: "Inspect stderr in the run log and retry after fixing credentials or branch state.",
  };
}
