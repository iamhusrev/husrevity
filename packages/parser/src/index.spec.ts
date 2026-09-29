import { DateTime } from 'luxon';
import { parseQuickAdd } from './index';

const ISTANBUL = 'Europe/Istanbul';
const now = () => DateTime.now().setZone(ISTANBUL);

function isoAt(dt: DateTime, hour: number, minute = 0): string {
  return dt.set({ hour, minute, second: 0, millisecond: 0 }).toUTC().toISO()!;
}

function nearestWeekday(from: DateTime, code: number): DateTime {
  let d = from;
  while (d.weekday !== code) d = d.plus({ days: 1 });
  return d;
}

describe('parseQuickAdd', () => {
  it('leaves plain text untouched with no scheduledAt', async () => {
    expect(await parseQuickAdd('sadece bir not')).toEqual({ title: 'sadece bir not' });
  });

  it('strips "bugün" and schedules for today at the default hour', async () => {
    const d = await parseQuickAdd('bugün rapor teslim et');
    expect(d.title).toBe('rapor teslim et');
    expect(d.scheduledAt).toBe(isoAt(now(), 9));
  });

  it('strips "yarın" and schedules for tomorrow at the default hour', async () => {
    const d = await parseQuickAdd('yarın toplantı');
    expect(d.title).toBe('toplantı');
    expect(d.scheduledAt).toBe(isoAt(now().plus({ days: 1 }), 9));
  });

  const weekdayCases: Array<[string, number]> = [
    ['pzt', 1],
    ['sal', 2],
    ['çar', 3],
    ['per', 4],
    ['cum', 5],
    ['cmt', 6],
    ['paz', 7],
  ];
  for (const [code, num] of weekdayCases) {
    it(`resolves weekday code "${code}" to the nearest matching date`, async () => {
      const d = await parseQuickAdd(`${code} diş hekimi`);
      expect(d.title).toBe('diş hekimi');
      expect(d.scheduledAt).toBe(isoAt(nearestWeekday(now(), num), 9));
    });
  }

  it('parses a colon time and overrides the default hour', async () => {
    const d = await parseQuickAdd('bugün 14:30 doktor');
    expect(d.title).toBe('doktor');
    expect(d.scheduledAt).toBe(isoAt(now(), 14, 30));
  });

  it('parses a locative-suffix time ("9da") together with #context', async () => {
    const d = await parseQuickAdd('yarın 9da HGS kontrol #alican');
    expect(d.title).toBe('HGS kontrol');
    expect(d.context).toBe('alican');
    expect(d.scheduledAt).toBe(isoAt(now().plus({ days: 1 }), 9, 0));
  });

  it('a bare time with no date word implies today', async () => {
    const d = await parseQuickAdd('14:00 kahve');
    expect(d.title).toBe('kahve');
    expect(d.scheduledAt).toBe(isoAt(now(), 14, 0));
  });

  it('extracts #context', async () => {
    const d = await parseQuickAdd('spor yap #saglik');
    expect(d.title).toBe('spor yap');
    expect(d.context).toBe('saglik');
  });

  it('extracts @proje reference', async () => {
    const d = await parseQuickAdd('rapor yaz @nakliya');
    expect(d.title).toBe('rapor yaz');
    expect(d.projectRef).toBe('nakliya');
  });

  it('extracts both #context and @proje together', async () => {
    const d = await parseQuickAdd('toplantı hazırlığı #is @nakliya');
    expect(d.title).toBe('toplantı hazırlığı');
    expect(d.context).toBe('is');
    expect(d.projectRef).toBe('nakliya');
  });

  it('extracts priority "!yüksek"', async () => {
    const d = await parseQuickAdd('acil arama yap !yüksek');
    expect(d.title).toBe('acil arama yap');
    expect(d.priority).toBe('yüksek');
  });

  it('extracts priority "!orta"', async () => {
    expect((await parseQuickAdd('bir şey !orta')).priority).toBe('orta');
  });

  it('extracts priority "!düşük"', async () => {
    expect((await parseQuickAdd('bir şey !düşük')).priority).toBe('düşük');
  });

  it('parses daily recurrence ("her gün") into FREQ=DAILY, anchored today', async () => {
    const d = await parseQuickAdd('her gün 06:30 kuran 20 sayfa #din');
    expect(d.title).toBe('kuran 20 sayfa');
    expect(d.rrule).toBe('FREQ=DAILY');
    expect(d.context).toBe('din');
    expect(d.scheduledAt).toBe(isoAt(now(), 6, 30));
  });

  const recurringWeekdayCases: Array<[string, number, string]> = [
    ['pzt', 1, 'MO'],
    ['sal', 2, 'TU'],
    ['çar', 3, 'WE'],
    ['per', 4, 'TH'],
    ['cum', 5, 'FR'],
    ['cmt', 6, 'SA'],
    ['paz', 7, 'SU'],
  ];
  for (const [code, num, rfc] of recurringWeekdayCases) {
    it(`parses single-weekday recurrence "her ${code}" into FREQ=WEEKLY;BYDAY=${rfc}`, async () => {
      const d = await parseQuickAdd(`her ${code} spor salonu`);
      expect(d.title).toBe('spor salonu');
      expect(d.rrule).toBe(`FREQ=WEEKLY;BYDAY=${rfc}`);
      expect(d.scheduledAt).toBe(isoAt(nearestWeekday(now(), num), 9));
    });
  }

  it('combines recurrence + priority + context in one sentence', async () => {
    const d = await parseQuickAdd('her pzt spor salonu !yüksek #saglik');
    expect(d.title).toBe('spor salonu');
    expect(d.rrule).toBe('FREQ=WEEKLY;BYDAY=MO');
    expect(d.priority).toBe('yüksek');
    expect(d.context).toBe('saglik');
  });

  it('does not double-match a recurring weekday as also a one-off date word ("her pzt" != "pzt")', async () => {
    const d = await parseQuickAdd('her pzt spor');
    expect(d.rrule).toBe('FREQ=WEEKLY;BYDAY=MO');
    expect(d.title).toBe('spor');
  });

  it('a numeric quantity in the title is not mistaken for a time token', async () => {
    const d = await parseQuickAdd('3 saat kitap oku');
    expect(d.title).toBe('3 saat kitap oku');
    expect(d.scheduledAt).toBeUndefined();
  });

  describe('llmFallback', () => {
    it('is called and merged in when no rule matched anything at all', async () => {
      const llmFallback = jest.fn().mockResolvedValue({ title: 'Diş hekimine git', scheduledAt: '2026-02-01T09:00:00.000Z' });
      const d = await parseQuickAdd('haftaya diş hekimine gitmem gerek', { llmFallback });

      expect(llmFallback).toHaveBeenCalledWith('haftaya diş hekimine gitmem gerek');
      expect(d).toEqual({ title: 'Diş hekimine git', scheduledAt: '2026-02-01T09:00:00.000Z' });
    });

    it('is never called when a rule already matched something', async () => {
      const llmFallback = jest.fn().mockResolvedValue({ title: 'should not be used' });
      const d = await parseQuickAdd('yarın toplantı', { llmFallback });

      expect(llmFallback).not.toHaveBeenCalled();
      expect(d.title).toBe('toplantı');
    });

    it('falls back to the plain rule-only draft when no llmFallback is supplied', async () => {
      const d = await parseQuickAdd('haftaya diş hekimine gitmem gerek');
      expect(d).toEqual({ title: 'haftaya diş hekimine gitmem gerek' });
    });
  });
});
