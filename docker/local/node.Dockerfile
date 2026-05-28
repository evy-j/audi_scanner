FROM docker:27-cli AS docker-cli

FROM node:20-bookworm

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=development \
    NPM_CONFIG_UPDATE_NOTIFIER=false

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    openssl \
    postgresql-client \
    tini \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /usr/local/libexec/docker/cli-plugins

COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/scanner-core/package.json packages/scanner-core/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY packages/database/prisma/schema.prisma packages/database/prisma/schema.prisma
RUN npm run db:generate

ENTRYPOINT ["tini", "--"]
