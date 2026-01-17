# =============================================================================
# G7 Analytics Frontend - Dockerfile
# =============================================================================
# Multi-stage build pour Next.js optimisé
#
# Usage:
#   docker build -t g7-frontend .
#   docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=http://localhost:8000 g7-frontend
# =============================================================================

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Dépendances (cache layer)
COPY package*.json ./
RUN npm ci

# Build
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copier les fichiers de build standalone
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:3000 || exit 1

CMD ["node", "server.js"]
