FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc tsconfig.base.json ./
COPY packages/ apps/ ./
COPY . .
RUN pnpm install --frozen-lockfile=false && pnpm --filter @planner/web build

FROM caddy:2-alpine AS runtime
COPY --from=build /app/apps/web/dist /srv
COPY infrastructure/caddy/Caddyfile /etc/caddy/Caddyfile
EXPOSE 8080
