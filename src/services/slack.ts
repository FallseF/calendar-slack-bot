import type { Env, SlackBlock, SlackMessage } from '../types';

const SLACK_API_BASE = 'https://slack.com/api';

/**
 * Slack署名を検証
 */
export async function verifySlackSignature(
  signingSecret: string,
  signature: string,
  timestamp: string,
  body: string
): Promise<boolean> {
  // リプレイ攻撃を防ぐため、5分以上前のリクエストは拒否
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 60 * 5) {
    console.error('Request timestamp too old');
    return false;
  }

  const sigBaseString = `v0:${timestamp}:${body}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(sigBaseString)
  );

  const mySignature = 'v0=' + Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return signature === mySignature;
}

/**
 * response_urlに返信
 */
export async function respondToUrl(
  responseUrl: string,
  message: SlackMessage
): Promise<void> {
  const response = await fetch(responseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Slack respond error:', error);
  }
}

// ========================================
// Block Kit UI Components
// ========================================

/**
 * 空き時間共有Block Kit
 */
export function createFreeTimeSlotsBlocks(slots: Array<{ date: string; startTime: string; endTime: string }>): SlackBlock[] {
  if (slots.length === 0) {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '今週は空き時間が見つかりませんでした。',
        },
      },
    ];
  }

  // 日付ごとにグループ化
  const slotsByDate = new Map<string, Array<{ startTime: string; endTime: string }>>();
  for (const slot of slots) {
    if (!slotsByDate.has(slot.date)) {
      slotsByDate.set(slot.date, []);
    }
    slotsByDate.get(slot.date)!.push({ startTime: slot.startTime, endTime: slot.endTime });
  }

  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const lines: string[] = [];

  for (const [date, daySlots] of slotsByDate) {
    const d = new Date(date);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekday = weekdays[d.getDay()];

    const times = daySlots
      .map(s => `${s.startTime}-${s.endTime}`)
      .join(', ');

    lines.push(`*${month}/${day}(${weekday})* ${times}`);
  }

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '全員の空き時間',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: lines.join('\n'),
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'ご都合いかがでしょうか？',
        },
      ],
    },
    { type: 'divider' },
  ];
}

/**
 * ヘルプメッセージBlock Kit
 */
export function createHelpBlocks(): SlackBlock[] {
  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '空き時間検索Bot',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'チームメンバー全員のカレンダーから空き時間を検索してチャンネルに共有します。',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*使い方:*\n`/cal` - 今週の空き時間をチャンネルに共有\n`/cal help` - このヘルプを表示',
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '平日10:00-19:00の空き時間を検索します（土日除く）',
        },
      ],
    },
    { type: 'divider' },
  ];
}
