# Stage 2: Runtime environment
FROM node:20-slim

WORKDIR /app

# 1. Copy package files FIRST
COPY package*.json ./

# 2. Install production dependencies
RUN npm install --omit=dev

# 3. Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# 4. Copy the rest of your code
COPY server.js ./
COPY --from=builder /app/build ./build

EXPOSE 8080

CMD ["npm", "start"]
