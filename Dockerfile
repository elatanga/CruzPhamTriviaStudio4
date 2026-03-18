# Stage 1: Build the frontend
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the frontend to the 'build' directory
RUN npm run build

# Stage 2: Runtime environment
FROM node:20-slim

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

ENV PORT=8080
# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Copy the server script and the built frontend
COPY server.js ./
COPY --from=builder /app/build ./build

# Cloud Run expects the app to listen on the PORT environment variable
# server.js defaults to 8080 if PORT is not set
EXPOSE 8080

# Start the Express server
CMD ["npm", "start"]
