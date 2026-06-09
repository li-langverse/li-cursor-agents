# Mint PAT for gitlab-github-mirror CronJob (read-only GitLab API + clone).
# Prefer: scripts/ensure-k8s-gitlab-pat.ps1 -Profile Mirror
# (API-tests gitlab-github-mirror-secrets GITLAB_TOKEN first; revokes only when minting + patching).
ENV["PAT_NAME"] ||= "gitlab-github-mirror-k8s"
ENV["PAT_SCOPES"] ||= "read_api,read_repository"
load ENV.fetch("MINT_LIB", File.expand_path("_mint_k8s_gitlab_pat.rb", __dir__))
