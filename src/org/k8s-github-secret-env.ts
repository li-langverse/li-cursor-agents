/** Standard GitHub secret env vars for org-swarm pods (primary + optional backup PAT). */
export function k8sGitHubSecretEnv(): Array<{
  name: string;
  valueFrom: { secretKeyRef: { name: string; key: string; optional?: boolean } };
}> {
  return [
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
  ];
}
