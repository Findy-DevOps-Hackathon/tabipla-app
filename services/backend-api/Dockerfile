# Cloud Run 向け @tabipla/backend-api イメージ（モノレポルートからビルド）
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

FROM base AS build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/db ./packages/db
COPY packages/search-core ./packages/search-core
COPY packages/maps-core ./packages/maps-core
COPY services/backend-api ./services/backend-api
RUN pnpm install --frozen-lockfile --filter @tabipla/backend-api...
RUN pnpm --filter @tabipla/search-core build
RUN pnpm --filter @tabipla/db build
RUN pnpm --filter @tabipla/maps-core build
RUN pnpm --filter @tabipla/backend-api build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/search-core/package.json ./packages/search-core/
COPY packages/maps-core/package.json ./packages/maps-core/
COPY services/backend-api/package.json ./services/backend-api/
RUN pnpm install --frozen-lockfile --filter @tabipla/backend-api... --prod

COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/search-core/dist ./packages/search-core/dist
COPY --from=build /app/packages/maps-core/dist ./packages/maps-core/dist
COPY --from=build /app/services/backend-api/dist ./services/backend-api/dist

WORKDIR /app/services/backend-api
EXPOSE 8080
CMD ["node", "dist/index.js"]
