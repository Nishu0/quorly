# ---- dependencies ---------------------------------------------------------
FROM oven/bun:1.3-alpine AS deps

WORKDIR /app
COPY package.json bun.lock* ./
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile

# ---- build ----------------------------------------------------------------
FROM oven/bun:1.3-alpine AS build

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .

# NEXT_PUBLIC_* is inlined at build time, so these have to be build args —
# setting them at runtime would leave the browser bundle with empty strings.
ARG NEXT_PUBLIC_PRIVY_APP_ID
ARG NEXT_PUBLIC_WORLD_APP_ID
ARG NEXT_PUBLIC_WORLD_ACTION
ENV NEXT_PUBLIC_PRIVY_APP_ID=$NEXT_PUBLIC_PRIVY_APP_ID \
    NEXT_PUBLIC_WORLD_APP_ID=$NEXT_PUBLIC_WORLD_APP_ID \
    NEXT_PUBLIC_WORLD_ACTION=$NEXT_PUBLIC_WORLD_ACTION \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app/apps/web
RUN bun run build

# ---- runtime --------------------------------------------------------------
FROM oven/bun:1.3-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000

RUN addgroup -g 10001 -S quorly && adduser -u 10001 -S quorly -G quorly

# Standalone output ships only the files actually reached, which matters on a
# 2-core box with 12GB of disk.
COPY --from=build --chown=quorly:quorly /app/apps/web/.next/standalone ./
COPY --from=build --chown=quorly:quorly /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=quorly:quorly /app/apps/web/public ./apps/web/public

USER quorly
EXPOSE 3000

CMD ["bun", "apps/web/server.js"]
