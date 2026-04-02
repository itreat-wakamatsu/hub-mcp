// データベーススキーマ定義
// テーブル: users, credentials, sessions

export const SCHEMA_SQL = `
-- ユーザーテーブル（Google OAuthで作成）
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,          -- Google sub (ユニークID)
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 認証情報テーブル（APIキー等を暗号化して保存）
CREATE TABLE IF NOT EXISTS credentials (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service     TEXT NOT NULL,             -- 'chatwork' | 'backlog' | 'gws' | 'circleback'
  key         TEXT NOT NULL,             -- 認証情報の種類 (e.g. 'api_token', 'api_key', 'space')
  value_enc   TEXT NOT NULL,             -- AES-256-GCM暗号化済み値
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, service, key)
);

-- MCPアクセストークンテーブル（ユーザーごとの長期トークン）
CREATE TABLE IF NOT EXISTS mcp_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,      -- ランダム生成トークン
  label       TEXT,                      -- 識別用ラベル (e.g. 'Claude Desktop')
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used_at INTEGER
);
`;
