import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * カレンダーAPI呼び出しのタイムゾーン処理テスト
 * 実際のAPI呼び出しはモックして、日付計算ロジックをテスト
 */

describe('Calendar API タイムゾーン処理', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('JSTでの日付計算', () => {
    it('日本時間で正しい日付文字列を生成できる', () => {
      // 2026-02-02 10:00 JST をセット
      vi.setSystemTime(new Date('2026-02-02T01:00:00Z')); // UTC 01:00 = JST 10:00

      const jstFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' });
      const todayStr = jstFormatter.format(new Date());

      expect(todayStr).toBe('2026-02-02');
    });

    it('UTC深夜（JST午前）でも正しいJST日付を返す', () => {
      // UTC 2026-02-01 20:00 = JST 2026-02-02 05:00
      vi.setSystemTime(new Date('2026-02-01T20:00:00Z'));

      const jstFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' });
      const todayStr = jstFormatter.format(new Date());

      // JSTでは既に2/2なのでそれが返る
      expect(todayStr).toBe('2026-02-02');
    });

    it('UTC午前（JST夕方）でも正しいJST日付を返す', () => {
      // UTC 2026-02-02 08:00 = JST 2026-02-02 17:00
      vi.setSystemTime(new Date('2026-02-02T08:00:00Z'));

      const jstFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' });
      const todayStr = jstFormatter.format(new Date());

      expect(todayStr).toBe('2026-02-02');
    });

    it('日付境界テスト: UTC 14:59 = JST 23:59', () => {
      // UTC 2026-02-02 14:59 = JST 2026-02-02 23:59
      vi.setSystemTime(new Date('2026-02-02T14:59:00Z'));

      const jstFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' });
      const todayStr = jstFormatter.format(new Date());

      expect(todayStr).toBe('2026-02-02');
    });

    it('日付境界テスト: UTC 15:00 = JST 翌日 00:00', () => {
      // UTC 2026-02-02 15:00 = JST 2026-02-03 00:00
      vi.setSystemTime(new Date('2026-02-02T15:00:00Z'));

      const jstFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' });
      const todayStr = jstFormatter.format(new Date());

      expect(todayStr).toBe('2026-02-03');
    });
  });

  describe('API検索範囲の計算', () => {
    it('正しい検索開始時刻を計算できる（JSTの0時）', () => {
      vi.setSystemTime(new Date('2026-02-02T01:00:00Z')); // JST 10:00

      const jstFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' });
      const todayStr = jstFormatter.format(new Date());

      // JSTの今日0時をUTCで表現
      const minDate = new Date(todayStr + 'T00:00:00+09:00');

      // UTC 2026-02-01 15:00 = JST 2026-02-02 00:00
      expect(minDate.toISOString()).toBe('2026-02-01T15:00:00.000Z');
    });

    it('正しい検索終了時刻を計算できる（7日後）', () => {
      vi.setSystemTime(new Date('2026-02-02T01:00:00Z')); // JST 10:00

      const jstFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' });
      const todayStr = jstFormatter.format(new Date());
      const daysFromNow = 7;

      const minDate = new Date(todayStr + 'T00:00:00+09:00');
      const maxDateBase = new Date(todayStr + 'T00:00:00+09:00');
      maxDateBase.setDate(maxDateBase.getDate() + daysFromNow);
      const maxDate = new Date(maxDateBase.getTime() - 1);

      // 7日後の0時 - 1ms = 6日後の23:59:59.999
      // JST 2026-02-09 00:00 - 1ms = JST 2026-02-08 23:59:59.999
      // = UTC 2026-02-08 14:59:59.999
      expect(maxDate.toISOString()).toBe('2026-02-08T14:59:59.999Z');
    });
  });
});

describe('Google Calendar APIレスポンスのパース', () => {
  it('dateTime形式のイベントから日付と時間を抽出できる', () => {
    const dateTime = '2026-02-02T14:00:00+09:00';

    const startDate = dateTime.split('T')[0];
    const startTime = dateTime.split('T')[1]?.slice(0, 5);

    expect(startDate).toBe('2026-02-02');
    expect(startTime).toBe('14:00');
  });

  it('UTC形式のdateTimeもパースできる', () => {
    const dateTime = '2026-02-02T05:00:00Z'; // UTC 05:00 = JST 14:00

    const startDate = dateTime.split('T')[0];
    const startTime = dateTime.split('T')[1]?.slice(0, 5);

    // 注意: このパース方法だとUTCの時刻がそのまま取れる
    expect(startDate).toBe('2026-02-02');
    expect(startTime).toBe('05:00'); // UTCの時刻
  });

  it('終日イベントはdate形式で返される', () => {
    const startDate = '2026-02-02'; // 終日イベント

    // 終日イベントは00:00-23:59として扱う
    const result = {
      startDate: startDate,
      startTime: '00:00',
      endTime: '23:59',
    };

    expect(result.startDate).toBe('2026-02-02');
    expect(result.startTime).toBe('00:00');
    expect(result.endTime).toBe('23:59');
  });
});
