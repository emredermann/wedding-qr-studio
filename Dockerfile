# syntax=docker/dockerfile:1
#
# Mira as a self-contained Node.js server (no Vercel needed).
# Runs anywhere Docker runs: a VPS (Hetzner, DigitalOcean…), AWS (ECS, App
# Runner, Lightsail), Google Cloud Run, Fly.io, Render…
#
#   docker build -t mira \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co \
#     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
#     --build-arg NEXT_PUBLIC_APP_URL=https://alanadiniz.com .
#   docker run -p 3000:3000 --env-file .env.production mira
#
# NEXT_PUBLIC_* values are inlined into the browser bundle at build time, so
# they are build arguments. Server secrets (service role key, Google client
# secret, APP_SECRET…) are read at runtime from the container environment and
# never baked into the image. See docs/CIKIS_PLANI.md.

ARG NODE_VERSION=22

# ---- 1) dependencies --------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- 2) build ---------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN=$NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- 3) runtime -------------------------------------------------------------
# Debian slim (glibc): no extra OS packages to download, so builds don't depend
# on a distro mirror being reachable.
FROM node:${NODE_VERSION}-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# The official image ships an unprivileged "node" user; the server runs as it.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
