# =============================================================================
# DataTalk Frontend Angular - Dockerfile
# =============================================================================
# Multi-stage build pour Angular 19 optimisé avec nginx
#
# Usage:
#   docker build -t datatalk-frontend .
#   docker run -p 3000:80 datatalk-frontend
# =============================================================================

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Dépendances (cache layer)
COPY package*.json ./
RUN npm ci

# Build production
COPY . .
RUN npm run build

# Stage 2: Production avec nginx
FROM nginx:alpine AS runner

# Copier la config nginx personnalisée
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copier les fichiers buildés depuis le stage builder
COPY --from=builder /app/dist/frontend-angular/browser /usr/share/nginx/html

# Exposer le port 80 (nginx default)
EXPOSE 80

# Healthcheck (using 127.0.0.1 instead of localhost to avoid IPv6 issues in Alpine)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
