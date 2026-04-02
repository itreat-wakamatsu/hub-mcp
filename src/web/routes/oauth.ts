import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import {
  buildChatworkAuthUrl, buildBacklogAuthUrl,
  exchangeChatworkCode, exchangeBacklogCode,
  verifyStateToken, disconnectService,
} from '../../auth/oauth.js';
import { verifySessionToken } from '../../auth/google.js';
import { getUserById } from '../../db/index.js';

const app = new Hono();

// ─── セッションからuserIdを取得するヘルパー ──────────────
async function getUserIdFromCookie(cookieValue: string | undefined): Promise<string | null> {
  if (!cookieValue) return null;
  try {
    const payload = await verifySessionToken(cookieValue);
    const user = getUserById(payload.sub);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

// ─── Chatwork ─────────────────────────────────────────
app.get('/chatwork', async (c) => {
  const userId = await getUserIdFromCookie(getCookie(c, 'session'));
  if (!userId) return c.redirect('/auth/login');
  return c.redirect(await buildChatworkAuthUrl(userId));
});

app.get('/chatwork/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) return c.text('不正なリクエストです', 400);
  try {
    const { userId, service } = await verifyStateToken(state);
    if (service !== 'chatwork') return c.text('不正なstateです', 400);
    await exchangeChatworkCode(userId, code);
    return c.redirect('/settings?connected=chatwork');
  } catch (err) {
    console.error('Chatwork OAuth callback error:', err);
    return c.text('Chatwork連携に失敗しました。もう一度試してください。', 500);
  }
});

// ─── Backlog ──────────────────────────────────────────
app.get('/backlog', async (c) => {
  const userId = await getUserIdFromCookie(getCookie(c, 'session'));
  if (!userId) return c.redirect('/auth/login');
  return c.redirect(await buildBacklogAuthUrl(userId));
});

app.get('/backlog/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) return c.text('不正なリクエストです', 400);
  try {
    const { userId, service } = await verifyStateToken(state);
    if (service !== 'backlog') return c.text('不正なstateです', 400);
    await exchangeBacklogCode(userId, code);
    return c.redirect('/settings?connected=backlog');
  } catch (err) {
    console.error('Backlog OAuth callback error:', err);
    return c.text('Backlog連携に失敗しました。もう一度試してください。', 500);
  }
});

// ─── 連携解除 ─────────────────────────────────────────
app.post('/disconnect', async (c) => {
  const userId = await getUserIdFromCookie(getCookie(c, 'session'));
  if (!userId) return c.redirect('/auth/login');
  const body = await c.req.parseBody();
  const service = body['service'] as 'chatwork' | 'backlog';
  if (service === 'chatwork' || service === 'backlog') {
    disconnectService(userId, service);
  }
  return c.redirect('/settings');
});

export default app;
