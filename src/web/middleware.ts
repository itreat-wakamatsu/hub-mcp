import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifySessionToken } from '../auth/google.js';
import { getUserById } from '../db/index.js';
import type { AppEnv } from './app.js';

export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const token = getCookie(c, 'session');
  if (!token) return c.redirect('/auth/login');
  try {
    const payload = await verifySessionToken(token);
    const user = getUserById(payload.sub);
    if (!user) return c.redirect('/auth/login');
    c.set('user', user);
    await next();
  } catch {
    return c.redirect('/auth/login');
  }
}
