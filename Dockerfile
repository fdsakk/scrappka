FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY client/package.json client/bun.lock ./client/
RUN cd client && bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
COPY client ./client

RUN cd client && bun run build

FROM oven/bun:1-slim
WORKDIR /app

# The knowledge export endpoint shells out to the system `zip` binary.
RUN apt-get update && apt-get install -y --no-install-recommends zip && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV SCRAPED_DIR=/data/scraped_data

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=build /app/src ./src
COPY --from=build /app/client/dist ./client/dist

RUN mkdir -p /data/scraped_data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "src/index.ts"]
