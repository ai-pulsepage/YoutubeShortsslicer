# Use Node 22 (latest LTS) - guarantees >=22.12 for Prisma 7.4.2
FROM node:22-slim AS base

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install --break-system-packages yt-dlp

WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy the rest of the application
COPY . .

# Generate Prisma client and build Next.js
RUN npx prisma generate && npm run build

# Expose the port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
