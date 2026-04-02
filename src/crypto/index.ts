import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX = process.env.ENCRYPTION_KEY;

function getMasterKey(): Buffer {
  if (!KEY_HEX || KEY_HEX.length !== 64) {
    throw new Error('ENCRYPTION_KEY は64文字の16進数文字列である必要があります（32バイト）');
  }
  return Buffer.from(KEY_HEX, 'hex');
}

/**
 * 平文を暗号化して "iv:authTag:ciphertext" 形式の文字列を返す
 */
export function encrypt(plaintext: string): string {
  const key = getMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

/**
 * "iv:authTag:ciphertext" 形式の文字列を復号して平文を返す
 */
export function decrypt(encoded: string): string {
  const key = getMasterKey();
  const [ivHex, authTagHex, ciphertextHex] = encoded.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) throw new Error('不正な暗号化データ形式');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** 暗号化キー生成用ユーティリティ（初期セットアップ時に使用） */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex');
}

/** MCPトークン生成 */
export function generateMcpToken(): string {
  return randomBytes(32).toString('base64url');
}
