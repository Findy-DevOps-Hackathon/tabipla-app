# Cloud Run 向け @tabipla/agent イメージ（モノレポルートからビルド）
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/db ./packages/db
COPY packages/search-core ./packages/search-core
COPY services/agent ./services/agent
RUN pnpm install --frozen-lockfile --filter @tabipla/agent...
RUN pnpm --filter @tabipla/search-core build
RUN pnpm --filter @tabipla/db build
RUN pnpm --filter @tabipla/agent build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/search-core/package.json ./packages/search-core/
COPY services/agent/package.json ./services/agent/
RUN pnpm install --frozen-lockfile --filter @tabipla/agent... --prod

COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/search-core/dist ./packages/search-core/dist
COPY --from=build /app/services/agent/dist ./services/agent/dist
COPY packages/db/seed-data ./packages/db/seed-data

WORKDIR /app/services/agent
COPY services/agent/assets ./assets
EXPOSE 8080
CMD ["node", "dist/server.js"]
