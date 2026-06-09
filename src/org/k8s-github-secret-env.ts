type K8sEnvVar =
  | { name: string; value: string }
  | {
      name: string;
      valueFrom: { secretKeyRef: { name: string; key: string; optional?: boolean } };
    };

/** GitLab-primary git host defaults (org policy). */
export function k8sOrgGitHostEnv(): K8sEnvVar[] {
  return [
    { name: "LI_GIT_HOST", value: process.env.LI_GIT_HOST?.trim() || "gitlab.lilangverse.xyz" },
    { name: "LI_GIT_GROUP", value: process.env.LI_GIT_GROUP?.trim() || "li-langverse" },
    { name: "LI_GIT_SCHEME", value: "https" },
  ];
}

/** Standard secret env for org-swarm pods: GitLab git + GitHub Issues/PR API. */
export function k8sGitHubSecretEnv(): K8sEnvVar[] {
  return [
    {
      name: "GITLAB_TOKEN",
      valueFrom: {
        secretKeyRef: { name: "li-agents-secrets", key: "GITLAB_TOKEN", optional: true },
      },
    },
    {
      name: "GH_SWARM_TOKEN",
      valueFrom: { secretKeyRef: { name: "li-agents-secrets", key: "GH_SWARM_TOKEN" } },
    },
    {
      name: "GH_SWARM_TOKEN_BACKUP",
      valueFrom: {
        secretKeyRef: { name: "li-agents-secrets", key: "GH_SWARM_TOKEN_BACKUP", optional: true },
      },
    },
    {
      name: "GH_TOKEN",
      valueFrom: { secretKeyRef: { name: "li-agents-secrets", key: "GH_SWARM_TOKEN" } },
    },
    ...k8sOrgGitHostEnv(),
  ];
}
