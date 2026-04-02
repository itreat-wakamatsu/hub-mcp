import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { chatworkTools } from './tools/chatwork.js';
import { backlogTools } from './tools/backlog.js';
import { getMcpTokenRecord, getUserById } from '../db/index.js';

const ALL_TOOLS = [...chatworkTools, ...backlogTools];

function resolveUserId(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const token = url.searchParams.get('token')
    ?? req.headers.authorization?.replace(/^Bearer\s+/, '');
  if (!token) return null;
  const record = getMcpTokenRecord(token);
  if (!record) return null;
  return getUserById(record.user_id)?.id ?? null;
}

function createMcpServerForUser(userId: string): McpServer {
  const server = new McpServer({ name: 'hub-mcp', version: '0.1.0' });

  for (const tool of ALL_TOOLS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.tool(tool.name, tool.description, tool.schema as any, async (input: Record<string, unknown>) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (tool as any).handler(userId, input);
        return { content: [{ type: 'text' as const, text: String(result) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `エラー: ${msg}` }], isError: true };
      }
    });
  }

  return server;
}

/**
 * Node.js IncomingMessage/ServerResponse を直接受け取るMCPハンドラ
 */
export async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const userId = resolveUserId(req);
  if (!userId) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '認証が必要です。?token=xxx を付与してください。' }));
    return;
  }

  const server = createMcpServerForUser(userId);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}
