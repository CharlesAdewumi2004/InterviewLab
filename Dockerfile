# InterviewLab, fully self contained: Node runtime, the language toolchains
# the runner drives, clangd for semantic C++ completion, and the Claude Code
# CLI for account linking. Model calls use YOUR Claude subscription; no
# credentials are baked into the image.
FROM node:26-bookworm

# Toolchains. Python, C++ and the JDK cover the languages most people practise
# in; JavaScript and TypeScript need only Node, which the base image provides.
# To add Go or Rust, append golang-go or rustc to this list and rebuild: the
# server detects whatever is on PATH at startup.
RUN apt-get update && apt-get install -y --no-install-recommends \
      g++ \
      python3 \
      clangd \
      default-jdk-headless \
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

# Serve API, WebSocket and the built client on one port, reachable from the host.
ENV HOST=0.0.0.0 \
    PORT=3001 \
    NODE_ENV=production
EXPOSE 3001

CMD ["npm", "run", "start", "-w", "server"]
