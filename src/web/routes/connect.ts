import { Hono } from 'hono';
import { requireAuth } from '../middleware.js';
import { createMcpToken, listMcpTokens, deleteMcpToken, type McpToken } from '../../db/index.js';
import { generateMcpToken } from '../../crypto/index.js';
import type { AppEnv } from '../app.js';
import type { User } from '../../db/index.js';

const app = new Hono<AppEnv>();
app.use('*', requireAuth);

app.get('/', (c) => {
  const user = c.get('user') as User;
  const tokens = listMcpTokens(user.id);
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
  return c.html(connectPage(user, tokens, baseUrl));
});

app.post('/create-token', (c) => {
  const user = c.get('user') as User;
  createMcpToken(user.id, generateMcpToken(), 'Claude Desktop');
  return c.redirect('/connect');
});

app.post('/delete-token', async (c) => {
  const user = c.get('user') as User;
  const body = await c.req.parseBody();
  const id = Number(body['id']);
  if (id) deleteMcpToken(user.id, id);
  return c.redirect('/connect');
});

// ─── HTML ─────────────────────────────────────────────
function connectPage(user: User, tokens: McpToken[], baseUrl: string): string {
  const tokenRows = tokens.map(t => {
    const mcpUrl = `${baseUrl}/mcp?token=${t.token}`;
    const configJson = JSON.stringify({
      mcpServers: { 'hub-mcp': { type: 'sse', url: mcpUrl } }
    }, null, 2);
    const lastUsed = t.last_used_at
      ? new Date(t.last_used_at * 1000).toLocaleString('ja-JP')
      : '未使用';
    return /* html */`
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <strong>${t.label ?? 'トークン'}</strong>
          <span style="font-size:12px;color:#6b7280;margin-left:8px">最終使用: ${lastUsed}</span>
        </div>
        <form method="POST" action="/connect/delete-token">
          <input type="hidden" name="id" value="${t.id}">
          <button class="btn btn-danger" style="padding:4px 10px;font-size:12px">削除</button>
        </form>
      </div>
      <p style="font-size:14px;margin-top:12px">
        <strong>MCP URL</strong><br>
        <code style="background:#f1f5f9;padding:4px 8px;border-radius:4px;font-size:12px;word-break:break-all">${mcpUrl}</code>
      </p>
      <details style="margin-top:12px">
        <summary style="cursor:pointer;font-size:14px;font-weight:500">Claude Desktop 設定（クリックで展開）</summary>
        <p style="font-size:13px;color:#6b7280;margin-top:8px">
          <code>~/.config/claude/claude_desktop_config.json</code> に以下を追加：
        </p>
        <pre style="background:#1e293b;color:#e2e8f0;padding:12px;border-radius:6px;font-size:12px;overflow-x:auto"><code>${configJson}</code></pre>
        <button onclick="navigator.clipboard.writeText(${JSON.stringify(configJson)});this.textContent='コピーしました！';setTimeout(()=>this.textContent='コピー',2000)"
          class="btn" style="margin-top:8px;padding:6px 14px;font-size:13px">コピー</button>
      </details>
    </div>`;
  }).join('');

  return /* html */`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>hub-mcp 接続設定</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f5f5f5; margin: 0; padding: 0; color: #333; }
    header { background: #2563eb; color: #fff; padding: 16px 32px;
             display: flex; justify-content: space-between; align-items: center; }
    header h1 { margin: 0; font-size: 20px; }
    main { max-width: 800px; margin: 32px auto; padding: 0 16px; }
    .card { background: #fff; border-radius: 8px; padding: 24px; margin-bottom: 24px;
            box-shadow: 0 1px 4px rgba(0,0,0,.1); }
    .btn { background: #2563eb; color: #fff; border: none; padding: 10px 20px;
           border-radius: 6px; cursor: pointer; font-size: 14px; }
    .btn:hover { background: #1d4ed8; }
    .btn-danger { background: #dc2626; }
    .btn-danger:hover { background: #b91c1c; }
    code { font-family: 'Menlo', monospace; }
    pre { margin: 0; white-space: pre-wrap; }
    a { color: #2563eb; text-decoration: none; }
    .steps { counter-reset: step; list-style: none; padding: 0; }
    .steps li { counter-increment: step; padding: 8px 0 8px 40px; position: relative; font-size: 14px; }
    .steps li::before { content: counter(step); position: absolute; left: 0;
      background: #2563eb; color: #fff; width: 24px; height: 24px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; }
  </style>
</head>
<body>
<header>
  <h1>hub-mcp 接続設定</h1>
  <span>${user.name}</span>
</header>
<main>
  <div class="card">
    <h2 style="margin-top:0">Claude Desktop への接続手順</h2>
    <ol class="steps">
      <li>下の「新しいトークンを発行」ボタンを押す</li>
      <li>表示された設定を <code>claude_desktop_config.json</code> にコピペする</li>
      <li>Claude Desktop を再起動する</li>
      <li>Claude に「Chatworkのルーム一覧を教えて」などと話しかける</li>
    </ol>
  </div>

  <form method="POST" action="/connect/create-token">
    <button type="submit" class="btn" style="margin-bottom:24px">＋ 新しいトークンを発行</button>
  </form>

  ${tokenRows || '<p style="color:#6b7280;font-size:14px">まだトークンがありません。上のボタンから発行してください。</p>'}

  <p style="margin-top:16px"><a href="/settings">← 設定に戻る</a></p>
</main>
</body>
</html>`;
}

export default app;
