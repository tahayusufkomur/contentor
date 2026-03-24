# --- Dev target (used by docker-compose.yml) ---
FROM node:20-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json* ./
COPY scripts/ ./scripts/
RUN npm ci || npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# --- Production build ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY scripts/ ./scripts/
RUN npm ci || npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
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
