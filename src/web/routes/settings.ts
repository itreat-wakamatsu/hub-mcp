import { Hono } from 'hono';
import { requireAuth } from '../middleware.js';
import { setCredential, getCredentialsByService, deleteCredential } from '../../db/index.js';
import { encrypt, decrypt } from '../../crypto/index.js';
import type { AppEnv } from '../app.js';
import type { User } from '../../db/index.js';

const app = new Hono<AppEnv>();
app.use('*', requireAuth);

app.get('/', async (c) => {
  const user = c.get('user') as User;
  const services = ['chatwork', 'backlog'] as const;
  const saved: Record<string, Record<string, string>> = {};
  for (const svc of services) {
    const enc = getCredentialsByService(user.id, svc);
    saved[svc] = Object.fromEntries(
      Object.entries(enc).map(([k, v]) => {
        try { return [k, decrypt(v)]; } catch { return [k, '']; }
      })
    );
  }
  return c.html(settingsPage(user, saved, c.req.query('saved') === '1'));
});

app.post('/save', async (c) => {
  const user = c.get('user') as User;
  const body = await c.req.parseBody();
  const fields: [string, string, string][] = [
    ['chatwork', 'api_token', body['chatwork_api_token'] as string],
    ['backlog', 'space', body['backlog_space'] as string],
    ['backlog', 'api_key', body['backlog_api_key'] as string],
  ];
  for (const [service, key, value] of fields) {
    if (value?.trim()) setCredential(user.id, service, key, encrypt(value.trim()));
  }
  return c.redirect('/settings?saved=1');
});

app.post('/delete', async (c) => {
  const user = c.get('user') as User;
  const body = await c.req.parseBody();
  const service = body['service'] as string;
  const key = body['key'] as string;
  if (service && key) deleteCredential(user.id, service, key);
  return c.redirect('/settings');
});

// ─── HTML ─────────────────────────────────────────────
function settingsPage(user: User, saved: Record<string, Record<string, string>>, showSaved: boolean): string {
  return /* html */`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>hub-mcp 設定</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #f5f5f5; margin: 0; padding: 0; color: #333; }
    header { background: #2563eb; color: #fff; padding: 16px 32px;
             display: flex; justify-content: space-between; align-items: center; }
    header h1 { margin: 0; font-size: 20px; }
    header span { font-size: 14px; opacity: .8; }
    main { max-width: 800px; margin: 32px auto; padding: 0 16px; }
    .card { background: #fff; border-radius: 8px; padding: 24px; margin-bottom: 24px;
            box-shadow: 0 1px 4px rgba(0,0,0,.1); }
    .card h2 { margin-top: 0; font-size: 18px; border-bottom: 1px solid #eee; padding-bottom: 12px; }
    label { display: block; margin-bottom: 4px; font-size: 14px; font-weight: 500; }
    input[type=text], input[type=password] {
      width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;
      font-size: 14px; margin-bottom: 16px; }
    .btn { background: #2563eb; color: #fff; border: none; padding: 10px 20px;
           border-radius: 6px; cursor: pointer; font-size: 14px; }
    .btn:hover { background: #1d4ed8; }
    .btn-danger { background: #dc2626; }
    .btn-danger:hover { background: #b91c1c; }
    .saved-val { font-size: 13px; color: #6b7280; margin-bottom: 16px;
                 display: flex; align-items: center; gap: 8px; }
    .alert { background: #d1fae5; color: #065f46; border-radius: 6px;
             padding: 12px 16px; margin-bottom: 24px; font-size: 14px; }
    .nav-links { margin-top: 24px; display: flex; gap: 16px; align-items: center; }
    .nav-links a { color: #2563eb; text-decoration: none; font-size: 14px; }
    form.inline { display: inline; }
  </style>
</head>
<body>
<header>
  <h1>hub-mcp 設定</h1>
  <span>${user.name}（${user.email}）</span>
</header>
<main>
  ${showSaved ? '<div class="alert">✓ 設定を保存しました</div>' : ''}

  <form method="POST" action="/settings/save">
    <div class="card">
      <h2>Chatwork</h2>
      <p style="font-size:14px;color:#6b7280">
        Chatwork の「設定」→「サービス連携」→「APIトークン」からコピーしてください。
      </p>
      <label>APIトークン</label>
      ${saved.chatwork?.api_token
        ? `<div class="saved-val">✓ 設定済み
            <form class="inline" method="POST" action="/settings/delete">
              <input type="hidden" name="service" value="chatwork">
              <input type="hidden" name="key" value="api_token">
              <button class="btn btn-danger" style="padding:4px 10px;font-size:12px">削除</button>
            </form>
           </div>`
        : `<input type="password" name="chatwork_api_token" placeholder="xxxxxxxxxxxxxxxxxxxx">`
      }
    </div>

    <div class="card">
      <h2>Backlog</h2>
      <p style="font-size:14px;color:#6b7280">
        Backlog の「個人設定」→「API」からAPIキーを取得してください。
      </p>
      <label>スペースID（例：mycompany）</label>
      ${saved.backlog?.space
        ? `<div class="saved-val">✓ 設定済み: ${saved.backlog.space}
            <form class="inline" method="POST" action="/settings/delete">
              <input type="hidden" name="service" value="backlog">
              <input type="hidden" name="key" value="space">
              <button class="btn btn-danger" style="padding:4px 10px;font-size:12px">削除</button>
            </form>
           </div>`
        : `<input type="text" name="backlog_space" placeholder="mycompany">`
      }
      <label>APIキー</label>
      ${saved.backlog?.api_key
        ? `<div class="saved-val">✓ 設定済み
            <form class="inline" method="POST" action="/settings/delete">
              <input type="hidden" name="service" value="backlog">
              <input type="hidden" name="key" value="api_key">
              <button class="btn btn-danger" style="padding:4px 10px;font-size:12px">削除</button>
            </form>
           </div>`
        : `<input type="password" name="backlog_api_key" placeholder="xxxxxxxxxxxxxxxxxxxx">`
      }
    </div>

    <button type="submit" class="btn">保存する</button>
  </form>

  <div class="nav-links">
    <a href="/connect">▶ MCPの接続設定を確認する</a>
    <form class="inline" method="POST" action="/auth/logout">
      <button style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:14px">ログアウト</button>
    </form>
  </div>
</main>
</body>
</html>`;
}

export default app;
