# syntax=docker/dockerfile:1

ARG NODE_VERSION=22-bookworm-slim

FROM node:${NODE_VERSION} AS base

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TURBO_TELEMETRY_DISABLED=1 \
    SKIP_ENV_VALIDATION=true

RUN corepack enable && corepack prepare pnpm@11.1.3 --activate

WORKDIR /repo

FROM base AS build

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm build:app

FROM node:${NODE_VERSION} AS runner

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000 \
    SHELVE_AUTO_MIGRATE=true \
    SHELVE_DB_WAIT=true \
    SHELVE_DB_WAIT_TIMEOUT_SECONDS=90

RUN groupadd --system --gid 1001 shelve \
  && useradd --system --uid 1001 --gid shelve --home-dir /app --shell /usr/sbin/nologin shelve

COPY --from=build --chown=shelve:shelve /repo/apps/shelve/.output ./
COPY --from=build --chown=shelve:shelve /repo/apps/shelve/server/db/migrations/postgresql ./migrations/postgresql
COPY --chown=shelve:shelve docker/entrypoint.mjs ./migrate/entrypoint.mjs

RUN npm install --prefix /app/migrate --omit=dev --no-audit --no-fund --package-lock=false --no-save postgres@3.4.9 drizzle-orm@0.45.2 \
  && chown -R shelve:shelve /app/migrate

USER shelve

EXPOSE 3000

CMD ["node", "migrate/entrypoint.mjs"]
