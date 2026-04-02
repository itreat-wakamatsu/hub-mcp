import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema.js';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'hub-mcp.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.exec(SCHEMA_SQL);
  return _db;
}

// ユーザー操作
export type User = { id: string; email: string; name: string; created_at: number };

export function upsertUser(user: Omit<User, 'created_at'>): User {
  const db = getDb();
  return db.prepare(`
    INSERT INTO users (id, email, name)
    VALUES (@id, @email, @name)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name
    RETURNING *
  `).get(user) as User;
}

export function getUserById(id: string): User | undefined {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

export function getUserByEmail(email: string): User | undefined {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;
}

// 認証情報操作
export function setCredential(userId: string, service: string, key: string, valueEnc: string): void {
  getDb().prepare(`
    INSERT INTO credentials (user_id, service, key, value_enc, updated_at)
    VALUES (?, ?, ?, ?, unixepoch())
    ON CONFLICT(user_id, service, key) DO UPDATE SET value_enc = excluded.value_enc, updated_at = unixepoch()
  `).run(userId, service, key, valueEnc);
}

export function getCredential(userId: string, service: string, key: string): string | undefined {
  const row = getDb().prepare(
    'SELECT value_enc FROM credentials WHERE user_id = ? AND service = ? AND key = ?'
  ).get(userId, service, key) as { value_enc: string } | undefined;
  return row?.value_enc;
}

export function getCredentialsByService(userId: string, service: string): Record<string, string> {
  const rows = getDb().prepare(
    'SELECT key, value_enc FROM credentials WHERE user_id = ? AND service = ?'
  ).all(userId, service) as { key: string; value_enc: string }[];
  return Object.fromEntries(rows.map(r => [r.key, r.value_enc]));
}

export function deleteCredential(userId: string, service: string, key: string): void {
  getDb().prepare(
    'DELETE FROM credentials WHERE user_id = ? AND service = ? AND key = ?'
  ).run(userId, service, key);
}

// MCPトークン操作
export type McpToken = {
  id: number; user_id: string; token: string;
  label: string | null; created_at: number; last_used_at: number | null;
};

export function createMcpToken(userId: string, token: string, label?: string): McpToken {
  return getDb().prepare(`
    INSERT INTO mcp_tokens (user_id, token, label) VALUES (?, ?, ?) RETURNING *
  `).get(userId, token, label ?? null) as McpToken;
}

export function getMcpTokenRecord(token: string): McpToken | undefined {
  const row = getDb().prepare('SELECT * FROM mcp_tokens WHERE token = ?').get(token) as McpToken | undefined;
  if (row) {
    getDb().prepare('UPDATE mcp_tokens SET last_used_at = unixepoch() WHERE token = ?').run(token);
  }
  return row;
}

export function listMcpTokens(userId: string): McpToken[] {
  return getDb().prepare('SELECT * FROM mcp_tokens WHERE user_id = ? ORDER BY created_at DESC').all(userId) as McpToken[];
}

export function deleteMcpToken(userId: string, tokenId: number): void {
  getDb().prepare('DELETE FROM mcp_tokens WHERE id = ? AND user_id = ?').run(tokenId, userId);
}
