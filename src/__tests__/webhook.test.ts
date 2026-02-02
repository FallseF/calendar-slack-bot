import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseCommand,
  findFreeTimeSlots,
  timeToMinutes,
  minutesToTime,
  type FreeTimeSlot,
} from '../handlers/webhook';
import type { BusySlot } from '../services/calendar';

describe('parseCommand', () => {
  describe('ヘルプコマンド', () => {
    it('「help」でhelpを返す', () => {
      expect(parseCommand('help')).toBe('help');
    });

    it('「HELP」（大文字）でhelpを返す', () => {
      expect(parseCommand('HELP')).toBe('help');
    });

    it('「ヘルプ」でhelpを返す', () => {
      expect(parseCommand('ヘルプ')).toBe('help');
    });

    it('「h」でhelpを返す', () => {
      expect(parseCommand('h')).toBe('help');
    });

    it('前後に空白があってもhelpを返す', () => {
      expect(parseCommand('  help  ')).toBe('help');
      expect(parseCommand('  h  ')).toBe('help');
    });
  });

  describe('検索コマンド（デフォルト動作）', () => {
    it('空文字でsearchを返す', () => {
      expect(parseCommand('')).toBe('search');
    });

    it('空白のみでsearchを返す', () => {
      expect(parseCommand('   ')).toBe('search');
    });

    it('未知の文字列でsearchを返す', () => {
      expect(parseCommand('こんにちは')).toBe('search');
      expect(parseCommand('予定')).toBe('search');
    });
  });
});

describe('timeToMinutes', () => {
  it('「10:00」を600分に変換', () => {
    expect(timeToMinutes('10:00')).toBe(600);
  });

  it('「19:00」を1140分に変換', () => {
    expect(timeToMinutes('19:00')).toBe(1140);
  });

  it('「12:30」を750分に変換', () => {
    expect(timeToMinutes('12:30')).toBe(750);
  });

  it('「00:00」を0分に変換', () => {
    expect(timeToMinutes('00:00')).toBe(0);
  });
});

describe('minutesToTime', () => {
  it('600分を「10:00」に変換', () => {
    expect(minutesToTime(600)).toBe('10:00');
  });

  it('1140分を「19:00」に変換', () => {
    expect(minutesToTime(1140)).toBe('19:00');
  });

  it('750分を「12:30」に変換', () => {
    expect(minutesToTime(750)).toBe('12:30');
  });

  it('0分を「00:00」に変換', () => {
    expect(minutesToTime(0)).toBe('00:00');
  });
});

describe('findFreeTimeSlots', () => {
  // 固定日時でテスト（2026-02-02 月曜日としてモック）
  const mockDate = new Date('2026-02-02T10:00:00+09:00');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('予定がなければ10:00-19:00が空き時間', () => {
    const busySlots: BusySlot[] = [];
    const result = findFreeTimeSlots(busySlots, 1);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      date: '2026-02-02',
      startTime: '10:00',
      endTime: '19:00',
    });
  });

  it('予定があると空き時間が分割される', () => {
    const busySlots: BusySlot[] = [
      { startDate: '2026-02-02', startTime: '11:00', endTime: '12:00' },
    ];
    const result = findFreeTimeSlots(busySlots, 1);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: '2026-02-02',
      startTime: '10:00',
      endTime: '11:00',
    });
    expect(result[1]).toEqual({
      date: '2026-02-02',
      startTime: '12:00',
      endTime: '19:00',
    });
  });

  it('1時間未満の空き時間は除外される', () => {
    const busySlots: BusySlot[] = [
      { startDate: '2026-02-02', startTime: '10:00', endTime: '10:30' },
      { startDate: '2026-02-02', startTime: '11:00', endTime: '19:00' },
    ];
    const result = findFreeTimeSlots(busySlots, 1);

    // 10:30-11:00 は30分なので除外される
    expect(result).toHaveLength(0);
  });

  it('土日はスキップされる', () => {
    // 2026-02-07 は土曜日
    vi.setSystemTime(new Date('2026-02-07T10:00:00+09:00'));

    const busySlots: BusySlot[] = [];
    const result = findFreeTimeSlots(busySlots, 2); // 土日のみ

    // 土日はスキップされるので結果は空
    expect(result).toHaveLength(0);
  });

  it('複数の予定が重複する場合はマージされる', () => {
    const busySlots: BusySlot[] = [
      { startDate: '2026-02-02', startTime: '11:00', endTime: '13:00' },
      { startDate: '2026-02-02', startTime: '12:00', endTime: '14:00' },
    ];
    const result = findFreeTimeSlots(busySlots, 1);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: '2026-02-02',
      startTime: '10:00',
      endTime: '11:00',
    });
    expect(result[1]).toEqual({
      date: '2026-02-02',
      startTime: '14:00',
      endTime: '19:00',
    });
  });

  it('業務時間外の予定は無視される', () => {
    const busySlots: BusySlot[] = [
      { startDate: '2026-02-02', startTime: '08:00', endTime: '09:00' },
      { startDate: '2026-02-02', startTime: '20:00', endTime: '22:00' },
    ];
    const result = findFreeTimeSlots(busySlots, 1);

    // 業務時間外の予定は影響しない
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      date: '2026-02-02',
      startTime: '10:00',
      endTime: '19:00',
    });
  });

  it('複数日にわたる空き時間が正しく計算される', () => {
    const busySlots: BusySlot[] = [
      { startDate: '2026-02-02', startTime: '10:00', endTime: '19:00' }, // 月曜全日
      { startDate: '2026-02-03', startTime: '14:00', endTime: '16:00' }, // 火曜午後
    ];
    const result = findFreeTimeSlots(busySlots, 2); // 月・火の2日間

    // 月曜は全日埋まってるので空きなし
    // 火曜は10:00-14:00と16:00-19:00が空き
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: '2026-02-03',
      startTime: '10:00',
      endTime: '14:00',
    });
    expect(result[1]).toEqual({
      date: '2026-02-03',
      startTime: '16:00',
      endTime: '19:00',
    });
  });
});
