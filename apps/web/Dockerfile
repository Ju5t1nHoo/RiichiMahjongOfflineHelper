# build
FROM node:20-alpine AS build

RUN npm install -g pnpm@10

WORKDIR /app

COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/web/index.html apps/web/index.html
COPY apps/web/vite.config.ts apps/web/vite.config.ts
COPY apps/web/tsconfig.json apps/web/tsconfig.json
COPY apps/web/src apps/web/src
COPY packages/rules/package.json packages/rules/package.json
COPY packages/rules/src packages/rules/src

RUN pnpm install --filter @riichi/web --filter @riichi/rules --frozen-lockfile=false
RUN pnpm --filter @riichi/web build

# serve
FROM nginx:alpine

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
