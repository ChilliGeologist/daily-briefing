FROM node:22-alpine

LABEL org.opencontainers.image.source="https://github.com/ChilliGeologist/daily-briefing"
LABEL org.opencontainers.image.description="Self-hosted news aggregator with Ollama-powered LLM curation"

RUN apk add --no-cache tzdata python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production && apk del python3 make g++

COPY . .

RUN mkdir -p /app/data

ARG COMMIT_SHA=dev
ARG BUILD_DATE=unknown
ENV DAILY_BRIEFING_VERSION=${COMMIT_SHA}
ENV DAILY_BRIEFING_BUILD_DATE=${BUILD_DATE}

EXPOSE 3100

ENV TZ=UTC

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3100/api/health || exit 1

CMD ["node", "server.js"]
