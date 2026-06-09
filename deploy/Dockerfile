# li-cursor-agents image for K8s swarm workers (engine cluster).
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 git ca-certificates curl bash \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
  && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build \
  && npm --prefix apps/org-supervisor-dashboard ci \
  && npm --prefix apps/org-supervisor-dashboard run build \
  && npm prune --omit=dev \
  && npm --prefix apps/org-supervisor-dashboard prune --omit=dev

COPY deploy/org-worker-entrypoint.sh deploy/k8s-git-auth.sh /app/deploy/
# Windows checkouts often carry CRLF despite .gitattributes; strip before exec.
RUN find /app/deploy /app/scripts -type f -name '*.sh' -exec sed -i 's/\r$//' {} + \
  && chmod +x /app/deploy/org-worker-entrypoint.sh /app/deploy/k8s-git-auth.sh

ENV NODE_ENV=production
# Default: org-issue worker one-shot (CronJob overrides command).
CMD ["node", "dist/cli/org-issue-worker.js", "once"]
