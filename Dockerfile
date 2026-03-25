# Use Node 22 (latest LTS) - guarantees >=22.12 for Prisma 7.4.2
FROM node:22-slim AS base

# Install system dependencies + fonts for subtitle rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    openssl \
    fontconfig \
    fonts-liberation \
    fonts-noto-core \
    wget \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /usr/share/fonts/montserrat \
    && wget -q -O /usr/share/fonts/montserrat/Montserrat-Bold.ttf 'https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-Bold.ttf' \
    && wget -q -O /usr/share/fonts/montserrat/Montserrat-Regular.ttf 'https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-Regular.ttf' \
    && wget -q -O /usr/share/fonts/montserrat/Montserrat-SemiBold.ttf 'https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-SemiBold.ttf' \
    && fc-cache -fv

# Install yt-dlp
RUN pip3 install --break-system-packages yt-dlp

WORKDIR /app

# Copy package files and prisma schema first for better caching
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install ALL dependencies (devDeps needed for build: tailwindcss, postcss, etc.)
RUN npm ci

# Copy the rest of the application
COPY . .

# Build Next.js, then prune dev dependencies to keep image small
RUN npm run build && npm prune --omit=dev

# Expose the port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
