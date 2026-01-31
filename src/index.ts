import type { Env } from './types';
import { handleSlashCommand } from './handlers/webhook';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Slash command エンドポイント
    if (url.pathname === '/slack/command' && request.method === 'POST') {
      return handleSlashCommand(request, env, ctx);
    }

    // ヘルスチェック
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    // ルート
    if (url.pathname === '/') {
      return new Response('Calendar Slack Bot - Free Time Finder', { status: 200 });
    }

    return new Response('Not Found', { status: 404 });
  },
};
