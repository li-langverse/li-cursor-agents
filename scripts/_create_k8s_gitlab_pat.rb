# Mint PAT for K8s goal workers (GitLab-primary git).
# Prefer: scripts/ensure-k8s-gitlab-pat.ps1 -Profile GoalWorker
# (API-tests li-agents-secrets GITLAB_TOKEN first; revokes only when minting + patching).
ENV["PAT_NAME"] ||= "k8s-goal-worker-git"
ENV["PAT_SCOPES"] ||= "api,read_repository,write_repository"
load ENV.fetch("MINT_LIB", File.expand_path("_mint_k8s_gitlab_pat.rb", __dir__))
