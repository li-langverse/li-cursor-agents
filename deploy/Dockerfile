# li-cursor-agents image for K8s swarm workers (engine cluster).
# Toolchain: reuse org lic-ci image (LLVM pin matches lic/scripts/llvm-env.sh).
ARG LI_CI_IMAGE=ghcr.io/li-langverse/lic-ci:debian12-llvm22
FROM ${LI_CI_IMAGE}

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
CMD ["node", "dist/cli/org-issue-worker.js", "once"]
