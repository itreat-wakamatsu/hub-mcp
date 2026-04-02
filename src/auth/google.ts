import { SignJWT, jwtVerify } from 'jose';
import { upsertUser, type User } from '../db/index.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

function getConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const baseUrl = process.env.BASE_URL;
  const jwtSecret = process.env.JWT_SECRET;
  if (!clientId || !clientSecret || !baseUrl || !jwtSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / BASE_URL / JWT_SECRET が未設定です');
  }
  return { clientId, clientSecret, baseUrl, jwtSecret };
}

/** Google OAuth 認可URLを生成 */
export function buildAuthUrl(state?: string): string {
  const { clientId, baseUrl } = getConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
    ...(state ? { state } : {}),
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

/** 認可コードをトークンに交換 */
async function exchangeCode(code: string): Promise<{ access_token: string }> {
  const { clientId, clientSecret, baseUrl } = getConfig();
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${baseUrl}/auth/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string }>;
}

/** アクセストークンからユーザー情報を取得してDBにupsert */
export async function handleCallback(code: string): Promise<User> {
  const { access_token } = await exchangeCode(code);
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!res.ok) throw new Error(`Userinfo fetch failed: ${await res.text()}`);
  const info = await res.json() as { sub: string; email: string; name: string };
  return upsertUser({ id: info.sub, email: info.email, name: info.name });
}

/** セッションJWTを発行（有効期間7日） */
export async function signSessionToken(user: User): Promise<string> {
  const { jwtSecret } = getConfig();
  const secret = new TextEncoder().encode(jwtSecret);
  return new SignJWT({ sub: user.id, email: user.email, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret);
}

/** セッションJWTを検証してpayloadを返す */
export async function verifySessionToken(token: string): Promise<{ sub: string; email: string; name: string }> {
  const { jwtSecret } = getConfig();
  const secret = new TextEncoder().encode(jwtSecret);
  const { payload } = await jwtVerify(token, secret);
  return payload as { sub: string; email: string; name: string };
}
