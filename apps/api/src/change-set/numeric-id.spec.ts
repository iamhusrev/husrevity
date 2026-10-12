import { isValidNumericId } from './change-set.service';

describe('isValidNumericId', () => {
  it('accepts ordinary and boundary bigint ids', () => {
    expect(isValidNumericId('1')).toBe(true);
    expect(isValidNumericId('42')).toBe(true);
    expect(isValidNumericId('9223372036854775807')).toBe(true);
  });

  it('rejects a 19-digit value above the bigint maximum (Postgres 22003)', () => {
    expect(isValidNumericId('9223372036854775808')).toBe(false);
    expect(isValidNumericId('9999999999999999999')).toBe(false);
  });

  it('rejects non-numeric, empty, padded and over-long input (Postgres 22P02)', () => {
    expect(isValidNumericId('abc')).toBe(false);
    expect(isValidNumericId('')).toBe(false);
    expect(isValidNumericId(' 12')).toBe(false);
    expect(isValidNumericId('12 ')).toBe(false);
    expect(isValidNumericId('-1')).toBe(false);
    expect(isValidNumericId('1'.repeat(40))).toBe(false);
    expect(isValidNumericId(undefined)).toBe(false);
    expect(isValidNumericId(12)).toBe(false);
  });
});
