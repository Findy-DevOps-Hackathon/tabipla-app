# Cloud Run 向け @tabipla/agent イメージ（モノレポルートからビルド）
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY services/agent ./services/agent
RUN pnpm install --frozen-lockfile --filter @tabipla/agent...
RUN pnpm --filter @tabipla/agent build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY services/agent/package.json ./services/agent/
RUN pnpm install --frozen-lockfile --filter @tabipla/agent --prod

COPY --from=build /app/services/agent/dist ./services/agent/dist
COPY packages/db/seed-data ./packages/db/seed-data

WORKDIR /app/services/agent
COPY services/agent/assets ./assets
EXPOSE 8080
CMD ["node", "dist/server.js"]
