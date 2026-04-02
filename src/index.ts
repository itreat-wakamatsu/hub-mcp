import http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getDb } from './db/index.js';
import { generateEncryptionKey } from './crypto/index.js';
import { handleMcpRequest } from './mcp/server.js';
import app from './web/app.js';

const PORT = Number(process.env.PORT ?? 3000);

// data/ ディレクトリがなければ作成
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// 必須環境変数チェック
const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'BASE_URL', 'JWT_SECRET', 'ENCRYPTION_KEY'];
const missing = required.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error('必須環境変数が未設定です:', missing.join(', '));
  console.error('');
  console.error('ENCRYPTION_KEY の生成例:');
  console.error(`  ENCRYPTION_KEY=${generateEncryptionKey()}`);
  process.exit(1);
}

// DB初期化
getDb();

// Node.js HTTPサーバーを作成
// /mcp は MCP transport へ、それ以外は Hono app へ
const server = http.createServer(async (req, res) => {
  const url = req.url ?? '/';
  if (url.startsWith('/mcp')) {
    await handleMcpRequest(req, res);
    return;
  }

  // Hono app へ転送（Fetch API に変換）
  const baseUrl = `http://${req.headers.host ?? 'localhost'}`;
  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (val) headers.set(key, Array.isArray(val) ? val.join(', ') : val);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  const hasBody = body && body.length > 0;

  const fetchReq = new Request(`${baseUrl}${url}`, {
    method: req.method ?? 'GET',
    headers,
    body: hasBody ? body : undefined,
    // duplex: 'half' は不要（Nodeではデフォルト）
  });

  let fetchRes: Response;
  try {
    fetchRes = await app.fetch(fetchReq);
  } catch (err) {
    console.error('Hono fetch error:', err);
    res.writeHead(500);
    res.end('Internal Server Error');
    return;
  }

  res.writeHead(fetchRes.status, fetchRes.statusText,
    Object.fromEntries(fetchRes.headers.entries()));
  const resBody = await fetchRes.arrayBuffer();
  res.end(Buffer.from(resBody));
});

server.listen(PORT, () => {
  console.log(`✓ hub-mcp サーバー起動: http://localhost:${PORT}`);
  console.log(`  設定画面:        http://localhost:${PORT}/settings`);
  console.log(`  MCPエンドポイント: http://localhost:${PORT}/mcp`);
});
