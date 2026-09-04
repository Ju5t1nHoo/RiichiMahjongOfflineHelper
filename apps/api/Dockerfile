FROM node:20-alpine

RUN npm install -g pnpm@10

WORKDIR /app

COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma apps/api/prisma
COPY apps/api/src apps/api/src
COPY packages/rules/package.json packages/rules/package.json
COPY packages/rules/src packages/rules/src

RUN pnpm install --filter @riichi/api --filter @riichi/rules --frozen-lockfile=false
RUN pnpm --dir apps/api exec prisma generate

EXPOSE 3000
CMD ["sh", "-c", "pnpm --dir apps/api exec prisma db push && pnpm --dir apps/api exec tsx src/index.ts"]
