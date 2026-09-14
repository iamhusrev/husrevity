import { ApiException } from '../common/api.exception';
import { parseDictatedItems } from './dictate-parser';

describe('parseDictatedItems', () => {
  describe('happy path', () => {
    it('returns valid items unchanged', () => {
      const raw = JSON.stringify({ items: ['Su iç', 'Rapor yaz'] });
      const out = parseDictatedItems(raw);
      expect(out).toEqual(['Su iç', 'Rapor yaz']);
    });

    it('strips markdown code fences before parsing', () => {
      const raw = '```json\n' + JSON.stringify({ items: ['Su iç'] }) + '\n```';
      const out = parseDictatedItems(raw);
      expect(out).toEqual(['Su iç']);
    });

    it('trims whitespace and drops blank items', () => {
      const raw = JSON.stringify({ items: ['  Su iç  ', '', '   ', 'Rapor yaz'] });
      const out = parseDictatedItems(raw);
      expect(out).toEqual(['Su iç', 'Rapor yaz']);
    });

    it('ignores non-string entries', () => {
      const raw = JSON.stringify({ items: ['Su iç', 42, null, { x: 1 }, 'Rapor yaz'] });
      const out = parseDictatedItems(raw);
      expect(out).toEqual(['Su iç', 'Rapor yaz']);
    });
  });

  describe('malformed input', () => {
    it('throws ApiException on non-JSON', () => {
      expect(() => parseDictatedItems('not json at all')).toThrow(ApiException);
    });

    it('throws ApiException when result is not an object', () => {
      const raw = JSON.stringify(['Su iç']);
      expect(() => parseDictatedItems(raw)).toThrow(ApiException);
    });

    it('throws ApiException when items key is missing', () => {
      const raw = JSON.stringify({ wrong: 'shape' });
      expect(() => parseDictatedItems(raw)).toThrow(ApiException);
    });

    it('throws ApiException when items is not an array', () => {
      const raw = JSON.stringify({ items: 'Su iç' });
      expect(() => parseDictatedItems(raw)).toThrow(ApiException);
    });

    it('throws ApiException when no usable items remain', () => {
      const raw = JSON.stringify({ items: ['', '   ', null, 42] });
      expect(() => parseDictatedItems(raw)).toThrow(ApiException);
    });
  });

  describe('coercion and clamping', () => {
    it('clamps over-long items to 255 characters', () => {
      const long = 'x'.repeat(500);
      const raw = JSON.stringify({ items: [long] });
      const out = parseDictatedItems(raw);
      expect(out[0]).toHaveLength(255);
      expect(out[0]).toBe(long.slice(0, 255));
    });

    it('caps the item count at 30', () => {
      const items = Array.from({ length: 40 }, (_, i) => `item-${i}`);
      const raw = JSON.stringify({ items });
      const out = parseDictatedItems(raw);
      expect(out).toHaveLength(30);
      expect(out[0]).toBe('item-0');
      expect(out[29]).toBe('item-29');
    });
  });
});
