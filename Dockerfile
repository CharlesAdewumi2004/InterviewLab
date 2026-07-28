# Practice IDE — fully self-contained: Node runtime, C++ toolchain (g++ +
# ASan/UBSan), Python 3, clangd for semantic completions, and the Claude Code
# CLI for account linking. Model calls use YOUR Claude Pro/Max subscription;
# no credentials are baked into the image.
FROM node:26-bookworm

# Toolchains the runner and LSP need. Debian bookworm's gcc 12 spells C++23 as
# -std=c++2b — the server probes and adapts automatically.
RUN apt-get update && apt-get install -y --no-install-recommends \
      g++ \
      python3 \
      clangd \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf "$(command -v clangd || echo /usr/bin/clangd)" /usr/local/bin/clangd

# Claude Code CLI, so `docker compose run --rm auth` can mint a subscription
# token without Node installed on the host.
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# Install with just the manifests first so Docker layer caching survives code
# edits without re-downloading node_modules.
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# Serve API + WebSocket + the built client on one port, reachable from the host.
ENV HOST=0.0.0.0 \
    PORT=3001 \
    NODE_ENV=production
EXPOSE 3001

CMD ["npm", "run", "start", "-w", "server"]
