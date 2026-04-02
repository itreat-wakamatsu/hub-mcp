import { Hono } from 'hono';
import { requireAuth } from '../middleware.js';
import { isConnected } from '../../auth/oauth.js';
import type { AppEnv } from '../app.js';
import type { User } from '../../db/index.js';

const app = new Hono<AppEnv>();
app.use('*', requireAuth);

app.get('/', (c) => {
  const user = c.get('user') as User;
  const connected = {
    chatwork: isConnected(user.id, 'chatwork'),
    backlog: isConnected(user.id, 'backlog'),
  };
  const msg = c.req.query('connected');
  return c.html(settingsPage(user, connected, msg));
});

// ─── HTML ─────────────────────────────────────────────
function settingsPage(
  user: User,
  connected: { chatwork: boolean; backlog: boolean },
  connectedMsg?: string,
): string {
  const alert = connectedMsg
    ? `<div class="alert">✓ ${connectedMsg === 'chatwork' ? 'Chatwork' : 'Backlog'} との連携が完了しました</div>`
    : '';

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
    .card h2 { margin-top: 0; font-size: 18px; border-bottom: 1px solid #eee; padding-bottom: 12px;
               display: flex; align-items: center; gap: 10px; }
    .badge { font-size: 12px; padding: 2px 8px; border-radius: 12px; font-weight: normal; }
    .badge-connected { background: #d1fae5; color: #065f46; }
    .badge-disconnected { background: #fee2e2; color: #991b1b; }
    .btn { display: inline-block; padding: 10px 20px; border-radius: 6px; cursor: pointer;
           font-size: 14px; font-weight: 500; border: none; text-decoration: none; }
    .btn-primary { background: #2563eb; color: #fff; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-danger { background: #dc2626; color: #fff; }
    .btn-danger:hover { background: #b91c1c; }
    .btn-outline { background: #fff; color: #374151; border: 1px solid #d1d5db; }
    .btn-outline:hover { background: #f9fafb; }
    .service-row { display: flex; justify-content: space-between; align-items: center; }
    .service-info p { margin: 4px 0; font-size: 14px; color: #6b7280; }
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
  ${alert}

  <!-- Chatwork -->
  <div class="card">
    <h2>
      Chatwork
      <span class="badge ${connected.chatwork ? 'badge-connected' : 'badge-disconnected'}">
        ${connected.chatwork ? '✓ 連携済み' : '未連携'}
      </span>
    </h2>
    <div class="service-row">
      <div class="service-info">
        ${connected.chatwork
          ? '<p>Chatworkと連携されています。メッセージの送受信・タスク管理が利用できます。</p>'
          : '<p>ボタンをクリックするとChatworkの認証画面が開きます。</p>'
        }
      </div>
      <div>
        ${connected.chatwork
          ? /* html */`
            <form class="inline" method="POST" action="/oauth/disconnect">
              <input type="hidden" name="service" value="chatwork">
              <button type="submit" class="btn btn-outline">連携解除</button>
            </form>`
          : `<a href="/oauth/chatwork" class="btn btn-primary">Chatworkと連携する</a>`
        }
      </div>
    </div>
  </div>

  <!-- Backlog -->
  <div class="card">
    <h2>
      Backlog
      <span class="badge ${connected.backlog ? 'badge-connected' : 'badge-disconnected'}">
        ${connected.backlog ? '✓ 連携済み' : '未連携'}
      </span>
    </h2>
    <div class="service-row">
      <div class="service-info">
        ${connected.backlog
          ? '<p>Backlogと連携されています。課題の参照・作成・コメントが利用できます。</p>'
          : '<p>ボタンをクリックするとBacklogの認証画面が開きます。</p>'
        }
      </div>
      <div>
        ${connected.backlog
          ? /* html */`
            <form class="inline" method="POST" action="/oauth/disconnect">
              <input type="hidden" name="service" value="backlog">
              <button type="submit" class="btn btn-outline">連携解除</button>
            </form>`
          : `<a href="/oauth/backlog" class="btn btn-primary">Backlogと連携する</a>`
        }
      </div>
    </div>
  </div>

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
