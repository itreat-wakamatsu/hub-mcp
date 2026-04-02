import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { buildAuthUrl, handleCallback, signSessionToken } from '../../auth/google.js';

const app = new Hono();

app.get('/login', (c) => {
  const url = buildAuthUrl();
  return c.redirect(url);
});

app.get('/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.text('認証コードが見つかりません', 400);
  try {
    const user = await handleCallback(code);
    const token = await signSessionToken(user);
    setCookie(c, 'session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 60 * 60 * 24 * 7, // 7日
      path: '/',
    });
    return c.redirect('/settings');
  } catch (err) {
    console.error('Auth callback error:', err);
    return c.text('認証に失敗しました', 500);
  }
});

app.post('/logout', (c) => {
  deleteCookie(c, 'session', { path: '/' });
  return c.redirect('/auth/login');
});

export default app;
