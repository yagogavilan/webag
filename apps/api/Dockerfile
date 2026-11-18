# Imagem de produção da API. Contexto de build = raiz do monorepo:
#   docker build -f apps/api/Dockerfile -t webag-api .
# Nenhum segredo entra na imagem: tudo vem do ambiente em tempo de execução.

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true TURBO_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@10.28.0 && npm cache clean --force
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --filter "@webag/api..."
RUN pnpm --filter "@webag/api..." run build
# Só dependências de produção da API, sem o resto do monorepo.
RUN pnpm --filter @webag/api deploy --prod --legacy /out

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    API_PORT=3000 \
    OPENAPI_SPEC_PATH=/app/openapi.yaml
WORKDIR /app
COPY --from=build --chown=node:node /out ./
COPY --from=build --chown=node:node /repo/docs/arquitetura/api/openapi.yaml ./openapi.yaml
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${API_PORT}/health" >/dev/null || exit 1
CMD ["node", "dist/main.js"]
