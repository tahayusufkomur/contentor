# --- Dev target (used by docker-compose.yml) ---
FROM node:20-alpine AS dev
WORKDIR /app
COPY frontend-main/package.json frontend-main/package-lock.json* ./
RUN npm ci || npm install
COPY packages /packages
# packages/shared has no node_modules ancestor on its own filesystem path;
# a root-level symlink lets Node's normal upward module resolution (used by
# both tsc and this app's own node_modules) find react/lucide-react/etc from
# shared files without any tsconfig "paths" trickery (which breaks @types
# resolution for bare specifiers project-wide — see Task 3 notes).
RUN ln -s /app/node_modules /node_modules
COPY frontend-main .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# --- Production build ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY frontend-main/package.json frontend-main/package-lock.json* ./
RUN npm ci || npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY packages /packages
RUN ln -s /app/node_modules /node_modules
COPY frontend-main .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* are inlined into the client bundle at build time.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_BASE_DOMAIN
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BASE_DOMAIN=$NEXT_PUBLIC_BASE_DOMAIN
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
