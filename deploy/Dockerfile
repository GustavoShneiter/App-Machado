FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG PUBLIC_SITE_URL
ENV VITE_PUBLIC_SITE_URL=$PUBLIC_SITE_URL
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOSTING_PLATFORM=contabo STORAGE_PROVIDER=filesystem DATA_DIRECTORY=/var/lib/machado
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir -p /var/lib/machado && chown node:node /var/lib/machado
USER node
EXPOSE 3000
CMD ["node","server/serve.mjs"]
