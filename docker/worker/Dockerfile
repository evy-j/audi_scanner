# syntax=docker/dockerfile:1.7

FROM docker:27-cli AS docker-cli

FROM node:20-bookworm-slim AS build

ENV NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/scanner-core/package.json packages/scanner-core/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY . .

RUN npm run db:generate \
  && npm --workspace @audit-scanner/shared run build \
  && npm --workspace @audit-scanner/database run build \
  && npm --workspace @audit-scanner/scanner-core run build \
  && npm --workspace @audit-scanner/worker run build \
  && npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker

WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/docker/security ./docker/security
COPY --from=build /app/packages ./packages

USER node

ENTRYPOINT ["tini", "--"]
CMD ["node", "apps/worker/dist/main.js"]
