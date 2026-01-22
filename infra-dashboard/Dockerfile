# Multi-stage build for infra-dashboard
# Stage 1: Build client and server
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source files
COPY . .

# Build client (Vite) - outputs to dist/client
RUN npm run build:client

# Build server (TypeScript to JavaScript)
RUN npx tsc -p tsconfig.server.json

# Stage 2: Production image
FROM node:22-alpine AS runner

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built server
COPY --from=builder /app/dist/server ./dist/server

# Copy built client
COPY --from=builder /app/dist/client ./dist/client

# Copy expected architecture config (ReactFlow-native format)
COPY expected-architecture-reactflow.json ./

# Expose port
EXPOSE 3001

# Set environment
ENV NODE_ENV=production
ENV INFRA_DASHBOARD_PORT=3001

# Run server (path matches tsconfig rootDir structure: dist/server/server/index.js)
CMD ["node", "dist/server/server/index.js"]
