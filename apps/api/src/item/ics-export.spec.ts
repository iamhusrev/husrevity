import { buildIcs, escapeIcsText, foldIcsLine, IcsItem } from './ics-export';

const NOW = new Date('2026-03-01T12:00:00Z');

function item(overrides: Partial<IcsItem>): IcsItem {
  return {
    id: '10',
    kind: 'event',
    title: 'Dentist',
    notes: null,
    context: null,
    scheduledAt: null,
    dueAt: null,
    durationMin: null,
    rrule: null,
    status: 'open',
    completedAt: null,
    ...overrides,
  };
}

/** Unfolds RFC 5545 content lines (CRLF followed by one space). */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, '').split('\r\n');
}

describe('escapeIcsText', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeIcsText('a\\b;c,d\ne\r\nf\rg')).toBe('a\\\\b\\;c\\,d\\ne\\nf\\ng');
  });

  it('does not mistake literal text for line-break markers', () => {
    expect(escapeIcsText('NLP and NL')).toBe('NLP and NL');
  });

  it('drops other control characters', () => {
    expect(escapeIcsText('a\u0000b\u0007c')).toBe('abc');
  });
});

describe('foldIcsLine', () => {
  const octets = (s: string) => Buffer.byteLength(s, 'utf8');

  it('leaves a short line untouched', () => {
    expect(foldIcsLine('SUMMARY:short')).toBe('SUMMARY:short');
  });

  it('folds ASCII at exactly 75 octets with continuation lines starting with one space', () => {
    const line = 'SUMMARY:' + 'a'.repeat(200);
    const folded = foldIcsLine(line);
    const parts = folded.split('\r\n');
    expect(octets(parts[0])).toBe(75);
    for (const p of parts.slice(1)) {
      expect(p.startsWith(' ')).toBe(true);
      expect(octets(p)).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });

  it('never splits a multi-byte character near the 75 octet boundary', () => {
    for (const ch of ['ş', '€', '😀']) {
      for (let n = 20; n < 45; n++) {
        const line = 'SUMMARY:' + ch.repeat(n);
        const folded = foldIcsLine(line);
        const parts = folded.split('\r\n');
        for (const p of parts) {
          expect(octets(p)).toBeLessThanOrEqual(75);
          expect(p).not.toContain('�');
        }
        expect(folded.replace(/\r\n /g, '')).toBe(line);
      }
    }
  });

  it('breaks the 2-octet title right before the character that would overflow', () => {
    const folded = foldIcsLine('SUMMARY:' + 'ş'.repeat(34));
    const [first, second] = folded.split('\r\n');
    expect(octets(first)).toBe(74);
    expect(second).toBe(' ş');
  });
});

describe('buildIcs', () => {
  it('produces the calendar envelope with CRLF endings and a single VTIMEZONE', () => {
    const ics = buildIcs([], NOW);
    expect(ics).toBe(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Husrevity//Husrevity//TR',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'X-WR-CALNAME:Husrevity',
        'BEGIN:VTIMEZONE',
        'TZID:Europe/Istanbul',
        'BEGIN:STANDARD',
        'DTSTART:19700101T000000',
        'TZOFFSETFROM:+0300',
        'TZOFFSETTO:+0300',
        'TZNAME:+03',
        'END:STANDARD',
        'END:VTIMEZONE',
        'END:VCALENDAR',
        '',
      ].join('\r\n'),
    );
    expect(ics.split('BEGIN:VTIMEZONE')).toHaveLength(2);
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('serialises a simple event as a golden string in Istanbul local time', () => {
    const ics = buildIcs(
      [
        item({
          scheduledAt: new Date('2026-03-02T07:00:00Z'),
          durationMin: 45,
          notes: 'Bring card',
          context: 'health',
        }),
      ],
      NOW,
    );
    const body = ics.slice(
      ics.indexOf('BEGIN:VEVENT'),
      ics.indexOf('END:VEVENT') + 'END:VEVENT'.length,
    );
    expect(body).toBe(
      [
        'BEGIN:VEVENT',
        'UID:item-10@husrevity',
        'DTSTAMP:20260301T120000Z',
        'DTSTART;TZID=Europe/Istanbul:20260302T100000',
        'DTEND;TZID=Europe/Istanbul:20260302T104500',
        'SUMMARY:Dentist',
        'DESCRIPTION:Bring card',
        'CATEGORIES:health',
        'STATUS:CONFIRMED',
        'SEQUENCE:0',
        'END:VEVENT',
      ].join('\r\n'),
    );
  });

  it('defaults the duration to 30 minutes and omits DESCRIPTION and CATEGORIES when absent', () => {
    const ics = buildIcs([item({ scheduledAt: new Date('2026-03-02T21:45:00Z') })], NOW);
    expect(ics).toContain('DTSTART;TZID=Europe/Istanbul:20260303T004500\r\n');
    expect(ics).toContain('DTEND;TZID=Europe/Istanbul:20260303T011500\r\n');
    expect(ics).not.toContain('DESCRIPTION');
    expect(ics).not.toContain('CATEGORIES');
  });

  it('escapes comma, semicolon and newline in title and notes', () => {
    const ics = buildIcs(
      [
        item({
          title: 'Lunch, with; Ali',
          notes: 'line1\nline2, more; stuff',
          scheduledAt: new Date('2026-03-02T09:00:00Z'),
        }),
      ],
      NOW,
    );
    const lines = unfold(ics);
    expect(lines).toContain('SUMMARY:Lunch\\, with\\; Ali');
    expect(lines).toContain('DESCRIPTION:line1\\nline2\\, more\\; stuff');
  });

  it('folds a long multi-byte title without splitting characters', () => {
    const title = 'ş'.repeat(34);
    const ics = buildIcs([item({ title, scheduledAt: new Date('2026-03-02T09:00:00Z') })], NOW);
    expect(ics).toContain('SUMMARY:' + 'ş'.repeat(33) + '\r\n ş\r\n');
    expect(unfold(ics)).toContain('SUMMARY:' + title);
    for (const physical of ics.split('\r\n')) {
      expect(Buffer.byteLength(physical, 'utf8')).toBeLessThanOrEqual(75);
    }
  });

  it('exports a recurring item once with RRULE and a local TZID DTSTART', () => {
    const ics = buildIcs(
      [
        item({
          id: '20',
          title: 'Standup',
          scheduledAt: new Date('2026-03-02T06:00:00Z'),
          durationMin: 15,
          rrule: 'FREQ=WEEKLY;BYDAY=MO,WE',
        }),
      ],
      NOW,
    );
    const lines = unfold(ics);
    expect(lines).toContain('DTSTART;TZID=Europe/Istanbul:20260302T090000');
    expect(lines).toContain('DTEND;TZID=Europe/Istanbul:20260302T091500');
    expect(lines).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,WE');
    expect(ics.split('BEGIN:VEVENT')).toHaveLength(2);
  });

  it('strips a stored RRULE: prefix', () => {
    const ics = buildIcs(
      [item({ scheduledAt: new Date('2026-03-02T06:00:00Z'), rrule: 'RRULE:FREQ=DAILY' })],
      NOW,
    );
    expect(unfold(ics)).toContain('RRULE:FREQ=DAILY');
    expect(ics).not.toContain('RRULE:RRULE');
  });

  it('exports a dueAt-only task as a VTODO with DUE and NEEDS-ACTION', () => {
    const ics = buildIcs(
      [
        item({
          id: '30',
          kind: 'task',
          title: 'Pay rent',
          dueAt: new Date('2026-03-05T15:30:00Z'),
        }),
      ],
      NOW,
    );
    const body = ics.slice(
      ics.indexOf('BEGIN:VTODO'),
      ics.indexOf('END:VTODO') + 'END:VTODO'.length,
    );
    expect(body).toBe(
      [
        'BEGIN:VTODO',
        'UID:item-30@husrevity',
        'DTSTAMP:20260301T120000Z',
        'DUE;TZID=Europe/Istanbul:20260305T183000',
        'SUMMARY:Pay rent',
        'STATUS:NEEDS-ACTION',
        'SEQUENCE:0',
        'END:VTODO',
      ].join('\r\n'),
    );
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('marks a done task COMPLETED with a UTC COMPLETED stamp, and a done event CONFIRMED', () => {
    const ics = buildIcs(
      [
        item({
          id: '31',
          kind: 'task',
          title: 'Done task',
          dueAt: new Date('2026-03-05T15:30:00Z'),
          status: 'done',
          completedAt: new Date('2026-03-04T08:00:00Z'),
        }),
        item({
          id: '32',
          title: 'Done event',
          scheduledAt: new Date('2026-03-05T10:00:00Z'),
          status: 'done',
        }),
      ],
      NOW,
    );
    const lines = unfold(ics);
    expect(lines).toContain('STATUS:COMPLETED');
    expect(lines).toContain('COMPLETED:20260304T080000Z');
    const eventPart = ics.slice(ics.indexOf('BEGIN:VEVENT'));
    expect(eventPart).toContain('STATUS:CONFIRMED');
  });

  it('never exports the values of payload, ownerId, projectId, goalId or legacyId', () => {
    const row = {
      ...item({ id: '10', scheduledAt: new Date('2026-03-02T07:00:00Z') }),
      payload: { secret: 'hunter2-payload' },
      ownerId: 'OWNER-4711',
      projectId: 'PROJECT-4712',
      goalId: 'GOAL-4713',
      legacyId: 'LEGACY-4714',
    } as IcsItem;
    const ics = buildIcs([row], NOW);
    for (const leaked of [
      'hunter2-payload',
      'OWNER-4711',
      'PROJECT-4712',
      'GOAL-4713',
      'LEGACY-4714',
      'secret',
    ]) {
      expect(ics).not.toContain(leaked);
    }
    expect(ics).toContain('UID:item-10@husrevity');
  });

  it('skips an item that has neither scheduledAt nor dueAt', () => {
    expect(buildIcs([item({})], NOW)).not.toContain('BEGIN:VEVENT');
  });

  describe('recurrence rules', () => {
    const series = (rrule: string) =>
      item({ id: '50', scheduledAt: new Date('2026-03-02T06:00:00Z'), rrule });

    it('drops a series whose rule does not parse', () => {
      for (const rrule of ['FREQ=BROKEN', 'garbage', 'FREQ=SECONDLY', 'FREQ=DAILY;COUNT=abc']) {
        const ics = buildIcs([series(rrule)], NOW);
        expect(ics).not.toContain('BEGIN:VEVENT');
        expect(ics).not.toContain('RRULE');
      }
    });

    it('converts a date-only UNTIL to the UTC end of that Istanbul day', () => {
      const ics = buildIcs([series('FREQ=DAILY;UNTIL=20260310')], NOW);
      expect(unfold(ics)).toContain('RRULE:FREQ=DAILY;UNTIL=20260310T205959Z');
    });

    it('converts a local-time UNTIL written with Z the same way', () => {
      const ics = buildIcs([series('FREQ=WEEKLY;UNTIL=20260310T090000Z;BYDAY=MO')], NOW);
      expect(unfold(ics)).toContain('RRULE:FREQ=WEEKLY;UNTIL=20260310T205959Z;BYDAY=MO');
    });

    it('passes COUNT through unchanged', () => {
      const ics = buildIcs([series('FREQ=DAILY;COUNT=5')], NOW);
      expect(unfold(ics)).toContain('RRULE:FREQ=DAILY;COUNT=5');
      expect(ics).not.toContain('UNTIL');
    });

    it('emits one EXDATE per skipped date at the anchor local time', () => {
      const ics = buildIcs([series('FREQ=DAILY')], NOW, {
        excludedDates: new Map([['50', ['2026-03-04', '2026-03-06']]]),
      });
      const lines = unfold(ics);
      expect(lines).toContain('EXDATE;TZID=Europe/Istanbul:20260304T090000');
      expect(lines).toContain('EXDATE;TZID=Europe/Istanbul:20260306T090000');
    });
  });

  describe('boundaries', () => {
    it('renders 23:30 Istanbul on the same local day (20:30Z)', () => {
      const ics = buildIcs(
        [item({ scheduledAt: new Date('2026-03-02T20:30:00Z'), durationMin: 15 })],
        NOW,
      );
      const lines = unfold(ics);
      expect(lines).toContain('DTSTART;TZID=Europe/Istanbul:20260302T233000');
      expect(lines).toContain('DTEND;TZID=Europe/Istanbul:20260302T234500');
    });

    it('rolls an event that crosses local midnight into the next day', () => {
      const ics = buildIcs(
        [item({ scheduledAt: new Date('2026-03-02T20:30:00Z'), durationMin: 60 })],
        NOW,
      );
      expect(unfold(ics)).toContain('DTEND;TZID=Europe/Istanbul:20260303T003000');
    });

    it('renders local 00:00:00 and 23:59:59 stamps exactly', () => {
      const ics = buildIcs(
        [
          item({ id: '1', scheduledAt: new Date('2026-03-01T00:00:00+03:00') }),
          item({ id: '2', scheduledAt: new Date('2026-03-31T23:59:59+03:00') }),
        ],
        NOW,
      );
      const lines = unfold(ics);
      expect(lines).toContain('DTSTART;TZID=Europe/Istanbul:20260301T000000');
      expect(lines).toContain('DTSTART;TZID=Europe/Istanbul:20260331T235959');
    });
  });

  describe('line folding at the 75 octet limit', () => {
    it('does not fold a line of exactly 75 octets', () => {
      const line = 'SUMMARY:' + 'a'.repeat(67);
      expect(Buffer.byteLength(line, 'utf8')).toBe(75);
      expect(foldIcsLine(line)).toBe(line);
    });

    it('folds a line of 76 octets into 75 + a continuation of one space and one octet', () => {
      const line = 'SUMMARY:' + 'a'.repeat(68);
      expect(Buffer.byteLength(line, 'utf8')).toBe(76);
      const parts = foldIcsLine(line).split('\r\n');
      expect(parts).toHaveLength(2);
      expect(Buffer.byteLength(parts[0], 'utf8')).toBe(75);
      expect(parts[1]).toBe(' a');
    });
  });
});
