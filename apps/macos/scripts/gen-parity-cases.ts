/**
 * Generates Tests/HusrevityJSTests/Fixtures/parity-cases.json from the REAL TypeScript
 * implementations (packages/parser and the API's ItemRecurrenceService) with a fixed clock.
 * The Swift tests assert that the JavaScriptCore bundle reproduces these outputs exactly.
 *
 *   bun run --tsconfig-override apps/macos/scripts/tsconfig.json apps/macos/scripts/gen-parity-cases.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Settings } from 'luxon';
import { parseQuickAdd } from '../../../packages/parser/src/index';
import { ItemRecurrenceService } from '../../api/src/item/item-recurrence.service';
import { expandOccurrences } from './core-js-expand';

const OUT = join(dirname(import.meta.path), '../Tests/HusrevityJSTests/Fixtures/parity-cases.json');

/** Sunday 11:30 Istanbul; Sunday 01:30 Istanbul Monday (UTC day differs); a Monday midnight. */
const NOWS = ['2026-10-18T08:30:00.000Z', '2026-10-18T22:30:00.000Z', '2026-03-02T00:00:00.000Z'];

const PARSE_INPUTS = [
  // every input of packages/parser/src/index.spec.ts
  'sadece bir not',
  'bugün rapor teslim et',
  'yarın toplantı',
  'pzt diş hekimi',
  'sal diş hekimi',
  'çar diş hekimi',
  'per diş hekimi',
  'cum diş hekimi',
  'cmt diş hekimi',
  'paz diş hekimi',
  'pazartesi diş hekimi',
  'salı diş hekimi',
  'çarşamba diş hekimi',
  'perşembe diş hekimi',
  'cuma diş hekimi',
  'cumartesi diş hekimi',
  'cuma 18de spor #saglik',
  'cuma günü toplantı',
  'pazar günü kahvaltı',
  'pazar alışverişi yap',
  'her cuma 18:00 spor',
  'her pazar kahvaltı',
  'bugün 14:30 doktor',
  'yarın 9da HGS kontrol #alican',
  '14:00 kahve',
  'spor yap #saglik',
  'rapor yaz @nakliya',
  'toplantı hazırlığı #is @nakliya',
  'acil arama yap !yüksek',
  'bir şey !orta',
  'bir şey !düşük',
  'her gün 06:30 kuran 20 sayfa #din',
  'her pzt spor salonu',
  'her sal spor salonu',
  'her çar spor salonu',
  'her per spor salonu',
  'her cum spor salonu',
  'her cmt spor salonu',
  'her paz spor salonu',
  'her pzt spor salonu !yüksek #saglik',
  'her pzt spor',
  '3 saat kitap oku',
  'haftaya diş hekimine gitmem gerek',
  // Turkish edge cases
  'her gün 7de koşu',
  'her gün 7de koşu #saglik !orta',
  'her hafta içi 8de yürüyüş',
  'hafta içi her gün 8de yürüyüş',
  'yarın 9:30da toplantı',
  'bugün 9:30 toplantı',
  'yarın 17te market',
  'yarın 23:59 yedek al',
  'bugün 00:15 gece nöbeti',
  'bugün 06:00 sabah koşusu',
  'bugün sabah koşusu 07:00',
  'BUGÜN Rapor',
  'Yarın TOPLANTI',
  'cuma 25:00 saçma',
  'cuma 9da',
  'yarın',
  '#saglik',
  '@proje',
  '!yüksek',
  '#çalışma ödev yap',
  '#iş @şirket !düşük rapor',
  '   yarın    9da    boşluklu    metin   ',
  'ş ğ ü ö ç ı İ karakter testi',
  'yarın emoji 🎉 parti',
  'pazar günü 10:00 kahvaltı',
  'pazar 10:00 kahvaltı',
  'her pazar günü 10:00 kahvaltı',
  'salı günü rapor',
  'cumartesi 14:00 maç',
  'her gün',
  'her cuma',
  '',
  '   ',
  'her gün 06:30 kuran 20 sayfa #din !orta @proje',
  'bugün bugün yarın',
  'yarın 9da 10da çift saat',
  'toplantı yarın 15:30 #is',
  'iki gün sonra toplantı',
  'spor yap 9da',
  "yarın 14'te randevu",
];

/**
 * Inputs whose result depends on the JS engine's case-insensitive regex folding: V8 (the server)
 * and Bun do not fold dotless "ı" with "I", the system JavaScriptCore does. Kept out of the
 * strict parity list; the Swift tests accept either outcome for these.
 */
const ENGINE_DEPENDENT_INPUTS = ['YARIN 9DA Toplantı'];

const RRULE_START = '2026-01-05T06:00:00.000Z'; // Monday 09:00 Istanbul
const BERLIN_START = '2026-03-20T09:00:00.000Z'; // 10:00 CET, before the last-Sunday DST jump

interface ExpandSpec {
  name: string;
  rrule: string;
  start: string;
  from: string;
  to: string;
  zone: string;
  /** true: expected values come from the real server service (Istanbul only). */
  server: boolean;
}

const EXPAND_SPECS: ExpandSpec[] = [
  { name: 'daily 7 days', rrule: 'FREQ=DAILY', start: RRULE_START, from: '2026-01-05T00:00:00.000Z', to: '2026-01-12T00:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'daily range starts after anchor', rrule: 'FREQ=DAILY', start: RRULE_START, from: '2026-02-01T00:00:00.000Z', to: '2026-02-04T23:59:59.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'weekly BYDAY=MO', rrule: 'FREQ=WEEKLY;BYDAY=MO', start: RRULE_START, from: '2026-01-01T00:00:00.000Z', to: '2026-02-28T00:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'weekly BYDAY=MO,WE,FR', rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR', start: RRULE_START, from: '2026-01-05T00:00:00.000Z', to: '2026-01-26T00:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'weekdays MO-FR', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', start: RRULE_START, from: '2026-01-05T00:00:00.000Z', to: '2026-01-19T00:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'every 2 weeks', rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', start: RRULE_START, from: '2026-01-05T00:00:00.000Z', to: '2026-03-31T00:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'monthly on day 31 skips short months', rrule: 'FREQ=MONTHLY;BYMONTHDAY=31', start: '2026-01-31T06:00:00.000Z', from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'monthly last friday', rrule: 'FREQ=MONTHLY;BYDAY=-1FR', start: RRULE_START, from: '2026-01-01T00:00:00.000Z', to: '2026-06-30T00:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'yearly', rrule: 'FREQ=YEARLY', start: RRULE_START, from: '2026-01-01T00:00:00.000Z', to: '2030-12-31T00:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'COUNT=3', rrule: 'FREQ=DAILY;COUNT=3', start: RRULE_START, from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'COUNT counted from anchor, not from range', rrule: 'FREQ=DAILY;COUNT=5', start: RRULE_START, from: '2026-01-08T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'UNTIL', rrule: 'FREQ=DAILY;UNTIL=20260110T000000Z', start: RRULE_START, from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'UNTIL inclusive same wall time', rrule: 'FREQ=DAILY;UNTIL=20260108T090000Z', start: RRULE_START, from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'range end equals an occurrence (inclusive)', rrule: 'FREQ=DAILY', start: RRULE_START, from: '2026-01-05T06:00:00.000Z', to: '2026-01-07T06:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'range end one second before occurrence', rrule: 'FREQ=DAILY', start: RRULE_START, from: '2026-01-05T06:00:00.000Z', to: '2026-01-07T05:59:59.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'range start one second after occurrence', rrule: 'FREQ=DAILY', start: RRULE_START, from: '2026-01-05T06:00:01.000Z', to: '2026-01-08T00:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'empty range before anchor', rrule: 'FREQ=DAILY', start: RRULE_START, from: '2025-01-01T00:00:00.000Z', to: '2025-02-01T00:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'from after to yields nothing', rrule: 'FREQ=DAILY', start: RRULE_START, from: '2026-02-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'late evening anchor keeps local date (UTC day differs)', rrule: 'FREQ=DAILY', start: '2026-01-05T21:30:00.000Z', from: '2026-01-05T00:00:00.000Z', to: '2026-01-09T00:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'pre-2016 DST era anchor (Istanbul had DST)', rrule: 'FREQ=WEEKLY;BYDAY=MO', start: '2015-06-01T06:00:00.000Z', from: '2015-03-01T00:00:00.000Z', to: '2015-12-31T00:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'MAX_OCCURRENCES cap (1000)', rrule: 'FREQ=HOURLY', start: RRULE_START, from: '2026-01-05T00:00:00.000Z', to: '2026-12-31T00:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  { name: 'MAX_SCAN_ITERATIONS cap (far-past hourly anchor)', rrule: 'FREQ=HOURLY', start: '2000-01-01T00:00:00.000Z', from: '2026-01-01T00:00:00.000Z', to: '2026-01-02T00:00:00.000Z', zone: 'Europe/Istanbul', server: true },
  // Zones with DST: only the shared implementation can produce expectations (the server is Istanbul-only).
  { name: 'Berlin daily across spring-forward keeps 10:00 local', rrule: 'FREQ=DAILY', start: BERLIN_START, from: '2026-03-20T00:00:00.000Z', to: '2026-04-05T00:00:00.000Z', zone: 'Europe/Berlin', server: false },
  { name: 'Berlin daily across fall-back keeps 10:00 local', rrule: 'FREQ=DAILY', start: '2026-10-20T09:00:00.000Z', from: '2026-10-20T00:00:00.000Z', to: '2026-11-03T00:00:00.000Z', zone: 'Europe/Berlin', server: false },
  { name: 'Berlin nonexistent local time 02:30 on spring-forward day', rrule: 'FREQ=DAILY', start: '2026-03-27T01:30:00.000Z', from: '2026-03-27T00:00:00.000Z', to: '2026-04-01T00:00:00.000Z', zone: 'Europe/Berlin', server: false },
  { name: 'New York weekly across spring-forward', rrule: 'FREQ=WEEKLY;BYDAY=SU', start: '2026-03-01T14:00:00.000Z', from: '2026-03-01T00:00:00.000Z', to: '2026-04-01T00:00:00.000Z', zone: 'America/New_York', server: false },
];

const INVALID_EXPANDS = [
  { name: 'garbage rrule', rrule: 'NOT A RULE' },
  { name: 'minutely forbidden', rrule: 'FREQ=MINUTELY' },
  { name: 'missing FREQ', rrule: 'BYDAY=MO' },
];

async function main() {
  const parse: unknown[] = [];
  for (const now of NOWS) {
    const ms = Date.parse(now);
    Settings.now = () => ms;
    for (const input of PARSE_INPUTS) {
      parse.push({ input, now, expected: await parseQuickAdd(input) });
    }
  }

  const engineDependent: unknown[] = [];
  Settings.now = () => Date.parse(NOWS[0]);
  for (const input of ENGINE_DEPENDENT_INPUTS) {
    engineDependent.push({ input, now: NOWS[0], serverExpected: await parseQuickAdd(input) });
  }

  const server = new ItemRecurrenceService();
  (server as any).logger = { warn: () => undefined }; // keep generator output quiet
  const expand = EXPAND_SPECS.map((spec) => {
    const mine = expandOccurrences(spec.rrule, spec.start, spec.from, spec.to, spec.zone);
    if (spec.server) {
      const real = server
        .expand({ scheduledAt: new Date(spec.start), rrule: spec.rrule }, new Date(spec.from), new Date(spec.to))
        .map((o) => ({ occursOn: o.occursOn, occursAt: o.occursAt.toISOString() }));
      if (JSON.stringify(real) !== JSON.stringify(mine)) {
        throw new Error(`shared expand diverges from ItemRecurrenceService for "${spec.name}"`);
      }
    }
    return { ...spec, expected: mine };
  });

  writeFileSync(
    OUT,
    JSON.stringify({ generatedBy: 'apps/macos/scripts/gen-parity-cases.ts', parse, engineDependent, expand, invalidExpand: INVALID_EXPANDS }, null, 2) + '\n',
  );
  console.log(`wrote ${OUT}: ${parse.length} parse cases, ${expand.length} expand cases`);
}

mkdirSync(dirname(OUT), { recursive: true });
main();
