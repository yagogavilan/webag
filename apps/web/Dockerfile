# Imagem de produção do painel web (Next.js, saída "standalone"). Contexto de build = raiz do monorepo:
#   docker build -f apps/web/Dockerfile -t webag-web .
# Nenhum segredo entra na imagem: ADMIN_HOST, LOJISTA_HOST, BFF_SHARED_SECRET, API_URL etc. vêm do ambiente
# em tempo de execução (ver infra/env.prod.example). A única variável de build é pública (vai para o navegador).

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true TURBO_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@10.28.0 && npm cache clean --force
WORKDIR /repo

FROM base AS build
# Pública (embutida no JavaScript do navegador): WhatsApp de suporte exibido nos painéis. Pode ficar vazia.
ARG NEXT_PUBLIC_SUPPORT_WHATSAPP=""
ENV NEXT_PUBLIC_SUPPORT_WHATSAPP=$NEXT_PUBLIC_SUPPORT_WHATSAPP
COPY . .
RUN pnpm install --frozen-lockfile --filter "@webag/web..."
# SEC-172: URL http/localhost em variável NEXT_PUBLIC_* falha o build em vez de ir para o navegador.
RUN node apps/web/scripts/check-build-env.mjs
RUN pnpm --filter "@webag/web..." run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0
WORKDIR /app
# O "standalone" já traz só o que o servidor precisa (inclusive o node_modules mínimo). Em monorepo,
# o servidor fica em apps/web/server.js.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
# O "standalone" NÃO inclui a pasta public: sem esta linha o logotipo, o favicon e a fonte Outfit dão 404 em produção.
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3001
# A página inicial (/) é pública e fica fora do proxy de autenticação: qualquer resposta < 500 = servidor vivo.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
