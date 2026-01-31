import type { Env } from '../types';

// ========================================
// 複数カレンダーから予定を取得（空き時間計算用）
// ========================================

export interface BusySlot {
  startDate: string;  // YYYY-MM-DD
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
}

// アクセストークンをキャッシュ
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/**
 * 複数カレンダーから指定期間の予定を取得（統合）
 */
export async function getAllBusySlots(
  env: Env,
  daysFromNow: number = 7
): Promise<BusySlot[]> {
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || !env.GOOGLE_CALENDAR_IDS) {
    console.error('Google Calendar API credentials not configured');
    return [];
  }

  // カンマ区切りでカレンダーIDを分割
  const calendarIds = env.GOOGLE_CALENDAR_IDS.split(',').map(id => id.trim()).filter(id => id);

  if (calendarIds.length === 0) {
    console.error('No calendar IDs configured');
    return [];
  }

  try {
    const accessToken = await getAccessToken(env);

    // 検索範囲を設定
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstNow = new Date(now.getTime() + jstOffset);

    const minDate = new Date(jstNow);
    minDate.setHours(0, 0, 0, 0);
    const maxDate = new Date(jstNow);
    maxDate.setDate(maxDate.getDate() + daysFromNow);
    maxDate.setHours(23, 59, 59, 999);

    const timeMin = minDate.toISOString();
    const timeMax = maxDate.toISOString();

    // 全カレンダーから予定を並列取得
    const allBusySlots: BusySlot[] = [];

    const fetchPromises = calendarIds.map(async (calendarId) => {
      try {
        const params = new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '100',
        });

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );

        if (!response.ok) {
          console.error(`Calendar fetch error for ${calendarId}:`, response.status);
          return [];
        }

        const data = await response.json() as {
          items: Array<{
            id: string;
            summary: string;
            start: { date?: string; dateTime?: string };
            end: { date?: string; dateTime?: string };
          }>;
        };

        return (data.items || []).map(item => {
          // 終日イベントの場合
          if (item.start.date) {
            return {
              startDate: item.start.date,
              startTime: '00:00',
              endTime: '23:59',
            };
          }

          // 時間指定イベントの場合
          const startDate = item.start.dateTime?.split('T')[0] || '';
          const startTime = item.start.dateTime?.split('T')[1]?.slice(0, 5) || '00:00';
          const endTime = item.end.dateTime?.split('T')[1]?.slice(0, 5) || '23:59';

          return {
            startDate,
            startTime,
            endTime,
          };
        });
      } catch (error) {
        console.error(`Error fetching calendar ${calendarId}:`, error);
        return [];
      }
    });

    const results = await Promise.all(fetchPromises);
    for (const slots of results) {
      allBusySlots.push(...slots);
    }

    return allBusySlots;
  } catch (error) {
    console.error('Failed to fetch busy slots:', error);
    return [];
  }
}

/**
 * サービスアカウントでアクセストークンを取得
 */
async function getAccessToken(env: Env): Promise<string> {
  // キャッシュがあり、まだ有効なら再利用
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 60000) {
    return cachedAccessToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600; // 1時間後

  // JWTを生成
  const jwt = await createJwt(
    env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
    now,
    exp
  );

  // アクセストークンを取得
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Token exchange failed:', errorText);
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };

  // キャッシュに保存
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

/**
 * JWTを生成（RS256署名）
 */
async function createJwt(
  clientEmail: string,
  privateKey: string,
  iat: number,
  exp: number
): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',  // 読み取り専用に変更
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // 秘密鍵をインポート
  const cryptoKey = await importPrivateKey(privateKey);

  // 署名を生成
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const encodedSignature = base64UrlEncode(signature);
  return `${unsignedToken}.${encodedSignature}`;
}

/**
 * PEM形式の秘密鍵をCryptoKeyにインポート
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // PEMヘッダー/フッターを削除し、改行を処理
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\n/g, '')
    .replace(/\s/g, '');

  // Base64デコード
  const binaryString = atob(pemContents);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

/**
 * Base64 URLエンコード
 */
function base64UrlEncode(input: string | ArrayBuffer): string {
  let base64: string;

  if (typeof input === 'string') {
    base64 = btoa(input);
  } else {
    const bytes = new Uint8Array(input);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  }

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
