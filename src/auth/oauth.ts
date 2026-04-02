import { SignJWT, jwtVerify } from 'jose';
import { setCredential, getCredential } from '../db/index.js';
import { encrypt, decrypt } from '../crypto/index.js';

// ─── Chatwork OAuth ────────────────────────────────────
const CW_AUTH_URL = 'https://www.chatwork.com/packages/oauth2/login.php';
const CW_TOKEN_URL = 'https://oauth.chatwork.com/token';
const CW_SCOPES = 'rooms.all:read_write contacts.all:read_only users.all:read_only';

// ─── Backlog OAuth ─────────────────────────────────────
function backlogUrls() {
  const space = process.env.BACKLOG_SPACE;
  if (!space) throw new Error('BACKLOG_SPACE が未設定です');
  return {
    authUrl: `https://${space}.backlog.com/OAuth2AccessRequest.action`,
    tokenUrl: `https://${space}.backlog.com/api/v2/oauth2/token`,
  };
}

// ─── State JWT（CSRF対策） ─────────────────────────────
const STATE_EXPIRY = '10m';

export async function buildStateToken(userId: string, service: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  return new SignJWT({ userId, service })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(STATE_EXPIRY)
    .sign(secret);
}

export async function verifyStateToken(state: string): Promise<{ userId: string; service: string }> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  const { payload } = await jwtVerify(state, secret);
  return payload as { userId: string; service: string };
}

// ─── 認可URL生成 ──────────────────────────────────────
export async function buildChatworkAuthUrl(userId: string): Promise<string> {
  const clientId = process.env.CHATWORK_CLIENT_ID;
  const baseUrl = process.env.BASE_URL;
  if (!clientId || !baseUrl) throw new Error('CHATWORK_CLIENT_ID / BASE_URL が未設定です');
  const state = await buildStateToken(userId, 'chatwork');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: `${baseUrl}/oauth/chatwork/callback`,
    scope: CW_SCOPES,
    state,
  });
  return `${CW_AUTH_URL}?${params}`;
}

export async function buildBacklogAuthUrl(userId: string): Promise<string> {
  const clientId = process.env.BACKLOG_CLIENT_ID;
  const baseUrl = process.env.BASE_URL;
  if (!clientId || !baseUrl) throw new Error('BACKLOG_CLIENT_ID / BASE_URL が未設定です');
  const state = await buildStateToken(userId, 'backlog');
  const { authUrl } = backlogUrls();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: `${baseUrl}/oauth/backlog/callback`,
    state,
  });
  return `${authUrl}?${params}`;
}

// ─── トークン交換・保存 ────────────────────────────────
type TokenResponse = { access_token: string; refresh_token: string; expires_in: number };

function saveTokens(userId: string, service: string, tokens: TokenResponse): void {
  const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;
  setCredential(userId, service, 'access_token', encrypt(tokens.access_token));
  setCredential(userId, service, 'refresh_token', encrypt(tokens.refresh_token));
  setCredential(userId, service, 'token_expires_at', encrypt(String(expiresAt)));
}

export async function exchangeChatworkCode(userId: string, code: string): Promise<void> {
  const clientId = process.env.CHATWORK_CLIENT_ID!;
  const clientSecret = process.env.CHATWORK_CLIENT_SECRET!;
  const baseUrl = process.env.BASE_URL!;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(CW_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${baseUrl}/oauth/chatwork/callback`,
    }),
  });
  if (!res.ok) throw new Error(`Chatwork token exchange failed: ${await res.text()}`);
  saveTokens(userId, 'chatwork', await res.json() as TokenResponse);
}

export async function exchangeBacklogCode(userId: string, code: string): Promise<void> {
  const clientId = process.env.BACKLOG_CLIENT_ID!;
  const clientSecret = process.env.BACKLOG_CLIENT_SECRET!;
  const baseUrl = process.env.BASE_URL!;
  const { tokenUrl } = backlogUrls();
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${baseUrl}/oauth/backlog/callback`,
    }),
  });
  if (!res.ok) throw new Error(`Backlog token exchange failed: ${await res.text()}`);
  saveTokens(userId, 'backlog', await res.json() as TokenResponse);
}

// ─── トークンリフレッシュ ──────────────────────────────
async function refreshChatworkToken(userId: string, refreshToken: string): Promise<string> {
  const clientId = process.env.CHATWORK_CLIENT_ID!;
  const clientSecret = process.env.CHATWORK_CLIENT_SECRET!;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(CW_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`Chatwork token refresh failed: ${await res.text()}`);
  const tokens = await res.json() as TokenResponse;
  saveTokens(userId, 'chatwork', tokens);
  return tokens.access_token;
}

async function refreshBacklogToken(userId: string, refreshToken: string): Promise<string> {
  const clientId = process.env.BACKLOG_CLIENT_ID!;
  const clientSecret = process.env.BACKLOG_CLIENT_SECRET!;
  const { tokenUrl } = backlogUrls();
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Backlog token refresh failed: ${await res.text()}`);
  const tokens = await res.json() as TokenResponse;
  saveTokens(userId, 'backlog', tokens);
  return tokens.access_token;
}

// ─── 有効なアクセストークン取得（外部から呼ぶ唯一の関数） ─
export async function getAccessToken(userId: string, service: 'chatwork' | 'backlog'): Promise<string> {
  const getEnc = (key: string) => getCredential(userId, service, key);
  const accessEnc = getEnc('access_token');
  const refreshEnc = getEnc('refresh_token');
  const expiresEnc = getEnc('token_expires_at');

  if (!accessEnc || !refreshEnc) {
    throw new Error(`${service} が連携されていません。設定画面から連携してください。`);
  }

  const accessToken = decrypt(accessEnc);
  const refreshToken = decrypt(refreshEnc);
  const expiresAt = expiresEnc ? Number(decrypt(expiresEnc)) : 0;

  // 5分バッファを持たせてリフレッシュ
  const needsRefresh = Date.now() / 1000 > expiresAt - 300;
  if (!needsRefresh) return accessToken;

  return service === 'chatwork'
    ? refreshChatworkToken(userId, refreshToken)
    : refreshBacklogToken(userId, refreshToken);
}

// ─── 連携済みか確認 ───────────────────────────────────
export function isConnected(userId: string, service: 'chatwork' | 'backlog'): boolean {
  return !!getCredential(userId, service, 'access_token');
}

// ─── 連携解除 ─────────────────────────────────────────
import { deleteCredential } from '../db/index.js';

export function disconnectService(userId: string, service: 'chatwork' | 'backlog'): void {
  for (const key of ['access_token', 'refresh_token', 'token_expires_at']) {
    deleteCredential(userId, service, key);
  }
}
