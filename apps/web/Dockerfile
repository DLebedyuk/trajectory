# Многостадийная сборка веба.
# Сначала копируются только манифесты: слой с pnpm install переустанавливается
# лишь при изменении зависимостей, а не на каждую правку в исходниках.
FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# В сборке нет терминала: pnpm не должен ничего спрашивать
ENV CI=true
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @planner/web build

FROM caddy:2-alpine AS runtime
COPY --from=build /app/apps/web/dist /srv
COPY infrastructure/caddy/Caddyfile /etc/caddy/Caddyfile
EXPOSE 8080
