# Multi-stage build for production-ready backend
# Stage 1: Dependencies
FROM node:18-alpine AS dependencies

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev dependencies for potential build steps)
RUN npm ci --only=production && \
    npm cache clean --force

# Stage 2: Production
FROM node:18-alpine AS production

# Install curl for healthcheck
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy production dependencies from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy package files
COPY package*.json ./

# Copy source code and prompts
COPY src ./src
COPY prompts ./prompts

# Create logs directory with proper permissions
RUN mkdir -p logs && \
    chown -R node:node /app

# Use non-root user for security
USER node

# Expose port
EXPOSE 5000

# Health check using curl instead of wget
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

# Start server
CMD ["node", "src/server.js"]

# Stage 3: Development (for docker-compose dev environment)
FROM node:18-alpine AS development

# Install curl for healthcheck and nodemon for hot reloading
RUN apk add --no-cache curl
RUN npm install -g nodemon

# Set working directory
WORKDIR /app

# Copy package files and install ALL dependencies (including dev)
COPY package*.json ./
RUN npm install

# Create logs directory with proper permissions
RUN mkdir -p logs && \
    chown -R node:node /app

# Use non-root user for security
USER node

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

# Start with nodemon for hot reloading
CMD ["nodemon", "--watch", "src", "--watch", "prompts", "src/server.js"]
