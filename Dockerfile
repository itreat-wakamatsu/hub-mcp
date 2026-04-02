# ── Stage 1: ビルド ──────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# 全依存（devDeps含む）をインストールしてビルド
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 2: 実行 ─────────────────────────────────────────
FROM node:22-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# 本番依存のみインストール
COPY package*.json ./
RUN npm ci --omit=dev

# ビルド成果物のみコピー
COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/index.js"]
