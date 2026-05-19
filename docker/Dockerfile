# Multi-stage/Production-grade Dockerfile for YTMP3 Engine
FROM node:18-bullseye-slim

# Install system dependencies: python3 (required by yt-dlp), ffmpeg (for transcoding), and curl
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Download the latest yt-dlp release and make it executable
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Set working directory
WORKDIR /app

# Copy package dependencies definitions
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy codebase
COPY . .

# Ensure temp and uploads folders exist and are writeable
RUN mkdir -p temp uploads public/sitemaps \
    && chmod -R 777 temp uploads public/sitemaps

# Expose port
EXPOSE 3000

# Start script (Default: start HTTP server)
CMD ["npm", "run", "start"]
