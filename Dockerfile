FROM node:22-slim

# Install system deps for pi (git, build tools)
RUN apt-get update && apt-get install -y \
    git \
    curl \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

# Install pi globally
RUN npm install -g @earendil-works/pi-coding-agent

# Install wrangler for deploy fallback
RUN npm install -g wrangler

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/telegram-bot/package.json packages/telegram-bot/
COPY extensions/orchestrator/package.json extensions/orchestrator/
COPY skills/orchestrator-interview/package.json skills/orchestrator-interview/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN pnpm build

# Data volume
VOLUME /data/pi-orchestrator

# Run bot
CMD ["node", "packages/telegram-bot/dist/entrypoint.js"]
