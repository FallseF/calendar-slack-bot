import type { Env, SlackSlashCommand, SlackMessage } from '../types';
import {
  verifySlackSignature,
  respondToUrl,
  createFreeTimeSlotsBlocks,
  createHelpBlocks,
} from '../services/slack';
import { getAllBusySlots, type BusySlot } from '../services/calendar';

/**
 * Slash commandを処理
 */
export async function handleSlashCommand(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  console.log('=== Slash command received ===');

  // 署名検証
  const signature = request.headers.get('x-slack-signature') || '';
  const timestamp = request.headers.get('x-slack-request-timestamp') || '';
  const body = await request.text();

  const isValid = await verifySlackSignature(env.SLACK_SIGNING_SECRET, signature, timestamp, body);
  if (!isValid) {
    console.error('Invalid signature');
    return new Response('Invalid signature', { status: 401 });
  }

  // フォームデータをパース
  const params = new URLSearchParams(body);
  const command: SlackSlashCommand = {
    token: params.get('token') || '',
    team_id: params.get('team_id') || '',
    team_domain: params.get('team_domain') || '',
    channel_id: params.get('channel_id') || '',
    channel_name: params.get('channel_name') || '',
    user_id: params.get('user_id') || '',
    user_name: params.get('user_name') || '',
    command: params.get('command') || '',
    text: params.get('text') || '',
    response_url: params.get('response_url') || '',
    trigger_id: params.get('trigger_id') || '',
  };

  console.log('Command:', command.command, 'Text:', command.text);

  // バックグラウンドで処理（3秒制限を回避）
  ctx.waitUntil(processSlashCommand(command, env));

  // 即座に応答
  return new Response(JSON.stringify({
    response_type: 'ephemeral',
    text: '空き時間を検索中...',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function processSlashCommand(command: SlackSlashCommand, env: Env): Promise<void> {
  const text = command.text.trim().toLowerCase();

  try {
    // ヘルプ
    if (text === 'help' || text === 'ヘルプ' || text === 'h') {
      const message: SlackMessage = {
        response_type: 'ephemeral',
        blocks: createHelpBlocks(),
      };
      await respondToUrl(command.response_url, message);
      return;
    }

    // 空き時間を検索（デフォルト動作）
    const busySlots = await getAllBusySlots(env, 7);
    const freeSlots = findFreeTimeSlots(busySlots, 7);

    const message: SlackMessage = {
      response_type: 'in_channel',  // チャンネルに共有
      blocks: createFreeTimeSlotsBlocks(freeSlots),
    };
    await respondToUrl(command.response_url, message);
  } catch (error) {
    console.error('Error processing slash command:', error);
    await respondToUrl(command.response_url, {
      response_type: 'ephemeral',
      text: 'エラーが発生しました。もう一度お試しください。',
    });
  }
}

/**
 * 空き時間スロットを見つける
 */
export interface FreeTimeSlot {
  date: string;
  startTime: string;
  endTime: string;
}

export function findFreeTimeSlots(busySlots: BusySlot[], days: number): FreeTimeSlot[] {
  const freeSlots: FreeTimeSlot[] = [];

  const WORK_START = 10;  // 10:00
  const WORK_END = 19;    // 19:00
  const MIN_SLOT_MINUTES = 60;  // 最低1時間の空き

  // JSTで今日の日付を取得
  const jstFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' });
  const todayStr = jstFormatter.format(new Date());

  for (let i = 0; i < days; i++) {
    // 日付を計算（UTCベースで日数を加算してからJSTに変換）
    const targetDateUTC = new Date(todayStr + 'T00:00:00Z');
    targetDateUTC.setUTCDate(targetDateUTC.getUTCDate() + i);
    const dateStr = jstFormatter.format(targetDateUTC);

    // 土日はスキップ
    const dayOfWeek = targetDateUTC.getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      continue;
    }

    // その日の予定を取得してソート
    const dayBusySlots = busySlots
      .filter(slot => slot.startDate === dateStr)
      .map(slot => ({
        start: timeToMinutes(slot.startTime),
        end: timeToMinutes(slot.endTime),
      }))
      .sort((a, b) => a.start - b.start);

    // 重複する予定をマージ
    const mergedSlots: Array<{ start: number; end: number }> = [];
    for (const slot of dayBusySlots) {
      if (mergedSlots.length === 0 || slot.start > mergedSlots[mergedSlots.length - 1].end) {
        mergedSlots.push({ ...slot });
      } else {
        mergedSlots[mergedSlots.length - 1].end = Math.max(
          mergedSlots[mergedSlots.length - 1].end,
          slot.end
        );
      }
    }

    // 空き時間を計算
    let currentTime = WORK_START * 60;
    const workEnd = WORK_END * 60;

    for (const slot of mergedSlots) {
      if (slot.start > currentTime && slot.start - currentTime >= MIN_SLOT_MINUTES) {
        const slotEnd = Math.min(slot.start, workEnd);
        if (slotEnd > currentTime) {
          freeSlots.push({
            date: dateStr,
            startTime: minutesToTime(currentTime),
            endTime: minutesToTime(slotEnd),
          });
        }
      }
      currentTime = Math.max(currentTime, slot.end);
    }

    // 最後の予定以降の空き
    if (currentTime < workEnd && workEnd - currentTime >= MIN_SLOT_MINUTES) {
      freeSlots.push({
        date: dateStr,
        startTime: minutesToTime(currentTime),
        endTime: minutesToTime(workEnd),
      });
    }
  }

  return freeSlots;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * コマンド種別を判定する
 */
export type CommandType = 'help' | 'search';

export function parseCommand(rawText: string): CommandType {
  const text = rawText.trim().toLowerCase();

  // ヘルプコマンド
  if (text === 'help' || text === 'ヘルプ' || text === 'h') {
    return 'help';
  }

  // それ以外は検索（デフォルト動作）
  return 'search';
}
