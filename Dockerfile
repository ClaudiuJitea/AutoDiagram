# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:22.14-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── Stage 2: builder ─────────────────────────────────────────────────────────
FROM node:22.14-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars are inlined at build time — must be passed as --build-arg
ARG NEXT_PUBLIC_ACCESS_PASSWORD
ENV NEXT_PUBLIC_ACCESS_PASSWORD=$NEXT_PUBLIC_ACCESS_PASSWORD

RUN pnpm run build

# ── Stage 3: runner ──────────────────────────────────────────────────────────
FROM node:22.14-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy standalone output and static assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Runtime env vars — inject via -e or --env-file at docker run:
# ACCESS_PASSWORD, SERVER_LLM_API_KEY, SERVER_LLM_BASE_URL,
# SERVER_LLM_TYPE, SERVER_LLM_MODEL

CMD ["node", "server.js"]
