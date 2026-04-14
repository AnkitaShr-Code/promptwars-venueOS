# Stage 1: Build the Vite frontend statics
FROM node:20-slim AS builder

WORKDIR /usr/src/app
# Dependency layer
COPY package*.json ./
COPY frontend/package*.json ./frontend/
RUN npm install
RUN cd frontend && npm install

# Build layer
COPY . .
RUN npm run build

# Stage 2: Production Monolithic Runtime
FROM node:20-slim

# Install redis natively
RUN apt-get update && apt-get install -y redis-server && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Transfer files
COPY --from=builder /usr/src/app ./

# Setup execution context
RUN chmod +x start.sh

# Cloud Run defaults mapping to 8080 usually via PORT env var
ENV PORT=8080
EXPOSE 8080

CMD ["./start.sh"]
