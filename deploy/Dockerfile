# li-cursor-agents image for K8s swarm workers (engine cluster).
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 git ca-certificates \
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

ENV NODE_ENV=production
# Default: org-issue worker one-shot (CronJob overrides command).
CMD ["node", "dist/cli/org-issue-worker.js", "once"]