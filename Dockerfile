# ─────────────────────────────────────
# Stage 1: Base
# ─────────────────────────────────────
FROM node:22-alpine AS base
RUN npm install -g pnpm@9.15.0

# ─────────────────────────────────────
# Stage 2: Dependencies
# ─────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/dashboard/package.json apps/dashboard/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────
# Stage 3: Builder (erbt alle node_modules aus deps)
# ─────────────────────────────────────
FROM deps AS builder
COPY . .
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter=dashboard build

# ─────────────────────────────────────
# Stage 4: Runner (Non-Root)
# ─────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3031
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Standalone output
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/dashboard/public ./apps/dashboard/public

# Datenverzeichnis für PVC-Mount (Settings)
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs
EXPOSE 3031

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3031/api/health || exit 1

CMD ["node", "apps/dashboard/server.js"]
