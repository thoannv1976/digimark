# DIGIMARK Arena API – Cloud Run image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t arena-api .
ARG NODE_IMAGE=node:22-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @arena/api --include-workspace-root=false --ignore-scripts --no-audit --no-fund
COPY packages packages
COPY apps/api apps/api
RUN npm run build --workspace @arena/api

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @arena/api --include-workspace-root=false --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/server.js"]
