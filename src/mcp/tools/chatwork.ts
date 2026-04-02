import { z } from 'zod';
import { getAccessToken } from '../../auth/oauth.js';

const BASE_URL = 'https://api.chatwork.com/v2';

async function cw(userId: string, path: string, opts?: RequestInit) {
  const token = await getAccessToken(userId, 'chatwork');
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: { 'Authorization': `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Chatwork API エラー [${res.status}]: ${await res.text()}`);
  return res.json();
}

export const chatworkTools = [
  {
    name: 'chatwork_get_my_status',
    description: '自分の未読数・未読DMメッセージ数・未完了タスク数を取得します',
    schema: {},
    async handler(userId: string, _input: Record<string, never>) {
      return JSON.stringify(await cw(userId, '/my/status'), null, 2);
    },
  },
  {
    name: 'chatwork_get_rooms',
    description: '自分が参加しているチャットルームの一覧を取得します',
    schema: {},
    async handler(userId: string, _input: Record<string, never>) {
      const data = await cw(userId, '/rooms') as {
        room_id: number; name: string; type: string; unread_num: number; mention_num: number;
      }[];
      return JSON.stringify(data.map(r => ({
        room_id: r.room_id, name: r.name, type: r.type,
        unread: r.unread_num, mention: r.mention_num,
      })), null, 2);
    },
  },
  {
    name: 'chatwork_get_messages',
    description: '指定したチャットルームのメッセージを取得します',
    schema: {
      room_id: z.number().describe('チャットルームID'),
      force: z.boolean().optional().default(false).describe('trueで既読も含む全メッセージ取得'),
    },
    async handler(userId: string, input: { room_id: number; force?: boolean }) {
      const { room_id, force = false } = input;
      return JSON.stringify(await cw(userId, `/rooms/${room_id}/messages?force=${force ? 1 : 0}`), null, 2);
    },
  },
  {
    name: 'chatwork_send_to_my_chat',
    description: '自分のマイチャットにメッセージを送信します（確認・下書き用途）。他ルームへの直接送信は不可。',
    schema: {
      body: z.string().min(1).describe('送信するメッセージ本文'),
    },
    async handler(userId: string, input: { body: string }) {
      const rooms = await cw(userId, '/rooms') as { room_id: number; type: string }[];
      const myChat = rooms.find(r => r.type === 'my');
      if (!myChat) throw new Error('マイチャットが見つかりません');
      const res = await cw(userId, `/rooms/${myChat.room_id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ body: input.body }).toString(),
      }) as { message_id: string };
      return `マイチャットに送信しました (message_id: ${res.message_id})`;
    },
  },
  {
    name: 'chatwork_get_my_tasks',
    description: '自分の担当タスク一覧を取得します',
    schema: {
      status: z.enum(['open', 'done']).optional().default('open').describe('タスクのステータス'),
    },
    async handler(userId: string, input: { status?: 'open' | 'done' }) {
      return JSON.stringify(await cw(userId, `/my/tasks?status=${input.status ?? 'open'}`), null, 2);
    },
  },
  {
    name: 'chatwork_get_contacts',
    description: 'Chatworkのコンタクト一覧を取得します',
    schema: {},
    async handler(userId: string, _input: Record<string, never>) {
      return JSON.stringify(await cw(userId, '/contacts'), null, 2);
    },
  },
];
