# Stage 1: Build the frontend
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files and install ALL dependencies (including devDeps for Vite)
COPY package*.json ./
RUN npm ci

# Copy the rest of the application and build
COPY . .
RUN npm run build

# Stage 2: Runtime environment
FROM node:20-slim

WORKDIR /app

# 1. Copy package files FIRST to the runtime stage
COPY package*.json ./

# 2. Install ONLY production dependencies
# This will now find 'express' once you add it to your package.json
RUN npm install --omit=dev

# 3. Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# 4. Copy the server script and the static build from the builder stage
COPY server.js ./
COPY --from=builder /app/build ./build

# Cloud Run listens on 8080
EXPOSE 8080

# 5. Start the server
CMD ["npm", "start"]
