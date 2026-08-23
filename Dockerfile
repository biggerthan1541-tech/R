# Readiness — production image.
#
# No build step: the app runs TypeScript directly through tsx, exactly as it
# does in development. This image exists to pin Node and Chromium and to carry
# the dependencies, not to compile anything.

FROM node:22-bookworm-slim

# Chromium renders evidence packs as PDFs. It is the single largest thing in
# this image; without it the app still runs and the PDF download returns a
# clear message instead of failing obscurely.
# tini reaps zombie Chromium processes, which otherwise accumulate.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation \
      tini \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    DATABASE_FILE=/data/readiness.db \
    BACKUP_DIR=/backups \
    PORT=3000

WORKDIR /app

# Dependencies first: this layer is cached until package.json changes, so an
# ordinary code change redeploys without recompiling better-sqlite3.
COPY package.json package-lock.json ./
# tsx is a runtime dependency here, not a build tool: there is no build step, so
# the server runs TypeScript directly. --omit=dev leaves out the typechecker and
# the type packages, which the running app does not need.
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

# The database and backups live on a mounted volume, never in the image.
# Anything written here without a volume is lost on the next deploy.
VOLUME ["/data"]

# Run unprivileged. The node user ships with the base image.
RUN mkdir -p /data /backups && chown -R node:node /data /backups /app
USER node

EXPOSE 3000

# Compose and the host both poll this; it also gates a rolling restart.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
# Resolved from node_modules, never fetched at start: a container that reaches
# the network to boot is a container that will not boot when it matters.
CMD ["node_modules/.bin/tsx", "src/server.ts"]
