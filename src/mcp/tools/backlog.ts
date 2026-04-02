import { z } from 'zod';
import { getAccessToken } from '../../auth/oauth.js';

function getBaseUrl(): string {
  const space = process.env.BACKLOG_SPACE;
  if (!space) throw new Error('BACKLOG_SPACE が未設定です');
  return `https://${space}.backlog.com/api/v2`;
}

async function bl(userId: string, path: string, opts?: RequestInit) {
  const token = await getAccessToken(userId, 'backlog');
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...opts,
    headers: { 'Authorization': `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Backlog API エラー [${res.status}]: ${await res.text()}`);
  return res.json();
}

export const backlogTools = [
  {
    name: 'backlog_get_my_profile',
    description: 'Backlogの自分のプロフィール情報を取得します',
    schema: {},
    async handler(userId: string, _input: Record<string, never>) {
      return JSON.stringify(await bl(userId, '/users/myself'), null, 2);
    },
  },
  {
    name: 'backlog_get_my_issues',
    description: '自分が担当者の未完了課題一覧を取得します',
    schema: {
      count: z.number().max(100).optional().default(20).describe('取得件数（最大100）'),
      project_key: z.string().optional().describe('プロジェクトキーで絞り込み（省略可）'),
    },
    async handler(userId: string, input: { count?: number; project_key?: string }) {
      const count = input.count ?? 20;
      const me = await bl(userId, '/users/myself') as { id: number };
      let path = `/issues?assigneeId[]=${me.id}&statusId[]=1&statusId[]=2&statusId[]=3&count=${count}`;
      if (input.project_key) {
        const proj = await bl(userId, `/projects/${input.project_key}`) as { id: number };
        path += `&projectId[]=${proj.id}`;
      }
      const data = await bl(userId, path) as {
        issueKey: string; summary: string; status: { name: string };
        assignee: { name: string } | null; dueDate: string | null;
      }[];
      return JSON.stringify(data.map(i => ({
        key: i.issueKey, summary: i.summary, status: i.status.name,
        assignee: i.assignee?.name ?? '未割当', dueDate: i.dueDate,
      })), null, 2);
    },
  },
  {
    name: 'backlog_get_issue',
    description: '指定した課題キーの詳細を取得します（例: PROJ-123）',
    schema: {
      issue_key: z.string().describe('課題キー（例: MYPROJECT-123）'),
    },
    async handler(userId: string, input: { issue_key: string }) {
      return JSON.stringify(await bl(userId, `/issues/${input.issue_key}`), null, 2);
    },
  },
  {
    name: 'backlog_create_issue',
    description: 'Backlogに新しい課題を作成します',
    schema: {
      project_key: z.string().describe('プロジェクトキー（例: MYPROJECT）'),
      summary: z.string().describe('課題のタイトル'),
      description: z.string().optional().describe('課題の詳細説明'),
      issue_type_name: z.string().optional().describe('課題種別名（省略時は最初の種別）'),
      priority: z.enum(['最高', '高', '中', '低']).optional().default('中').describe('優先度'),
      due_date: z.string().optional().describe('期限日 YYYY-MM-DD'),
    },
    async handler(userId: string, input: {
      project_key: string; summary: string; description?: string;
      issue_type_name?: string; priority?: string; due_date?: string;
    }) {
      const proj = await bl(userId, `/projects/${input.project_key}`) as { id: number };
      const issueTypes = await bl(userId, `/projects/${input.project_key}/issueTypes`) as { id: number; name: string }[];
      const issueType = input.issue_type_name
        ? (issueTypes.find(t => t.name === input.issue_type_name) ?? issueTypes[0])
        : issueTypes[0];
      if (!issueType) throw new Error('課題種別が見つかりません');
      const priorityMap: Record<string, number> = { '最高': 1, '高': 2, '中': 3, '低': 4 };
      const body = new URLSearchParams({
        projectId: String(proj.id),
        summary: input.summary,
        issueTypeId: String(issueType.id),
        priorityId: String(priorityMap[input.priority ?? '中']),
      });
      if (input.description) body.append('description', input.description);
      if (input.due_date) body.append('dueDate', input.due_date);
      const result = await bl(userId, '/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }) as { issueKey: string; summary: string };
      return `課題を作成しました: ${result.issueKey} - ${result.summary}`;
    },
  },
  {
    name: 'backlog_add_comment',
    description: '指定した課題にコメントを追加します',
    schema: {
      issue_key: z.string().describe('課題キー（例: MYPROJECT-123）'),
      content: z.string().min(1).describe('コメント本文'),
    },
    async handler(userId: string, input: { issue_key: string; content: string }) {
      const result = await bl(userId, `/issues/${input.issue_key}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ content: input.content }).toString(),
      }) as { id: number };
      return `コメントを追加しました (id: ${result.id})`;
    },
  },
  {
    name: 'backlog_get_notifications',
    description: 'Backlogの自分宛の通知一覧を取得します',
    schema: {
      count: z.number().max(100).optional().default(20).describe('取得件数（最大100）'),
    },
    async handler(userId: string, input: { count?: number }) {
      return JSON.stringify(await bl(userId, `/notifications?count=${input.count ?? 20}`), null, 2);
    },
  },
  {
    name: 'backlog_get_projects',
    description: '自分が参加しているBacklogプロジェクト一覧を取得します',
    schema: {},
    async handler(userId: string, _input: Record<string, never>) {
      const data = await bl(userId, '/projects') as { id: number; projectKey: string; name: string }[];
      return JSON.stringify(data.map(p => ({ id: p.id, key: p.projectKey, name: p.name })), null, 2);
    },
  },
];
