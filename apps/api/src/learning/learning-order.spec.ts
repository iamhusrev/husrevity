import { ApiException } from '../common/api.exception';
import { assertExactSet, fillSlots, insertAt, planRenumber } from './learning-order';

describe('learning-order helpers', () => {
  describe('assertExactSet', () => {
    it('accepts the same ids in any order', () => {
      expect(() => assertExactSet(['1', '2', '3'], ['3', '1', '2'])).not.toThrow();
    });

    it('rejects a missing id', () => {
      expect(() => assertExactSet(['1', '2', '3'], ['1', '2'])).toThrow(ApiException);
    });

    it('rejects an extra / foreign id', () => {
      expect(() => assertExactSet(['1', '2'], ['1', '2', '9'])).toThrow(ApiException);
    });

    it('rejects a duplicated id even when the length matches', () => {
      expect(() => assertExactSet(['1', '2', '3'], ['1', '1', '2'])).toThrow(ApiException);
    });

    it('accepts two empty lists', () => {
      expect(() => assertExactSet([], [])).not.toThrow();
    });
  });

  describe('planRenumber', () => {
    it('numbers 0..n-1 and returns only the rows whose position changes', () => {
      const rows = [
        { id: 'a', position: 0 },
        { id: 'b', position: 1 },
        { id: 'c', position: 2 },
      ];

      expect(planRenumber(rows, ['a', 'c', 'b'])).toEqual([
        { id: 'c', position: 1, from: 2 },
        { id: 'b', position: 2, from: 1 },
      ]);
    });

    it('repairs gaps and duplicate positions', () => {
      const rows = [
        { id: 'a', position: 5 },
        { id: 'b', position: 5 },
      ];

      expect(planRenumber(rows, ['a', 'b'])).toEqual([
        { id: 'a', position: 0, from: 5 },
        { id: 'b', position: 1, from: 5 },
      ]);
    });
  });

  describe('fillSlots', () => {
    it('refills the subset slots in the new order and keeps the others in place', () => {
      // 2024 topics: a, c, e. 2025 topics: b, d.
      const global = ['a', 'b', 'c', 'd', 'e'];

      expect(fillSlots(global, ['a', 'c', 'e'], ['e', 'a', 'c'])).toEqual([
        'e',
        'b',
        'a',
        'd',
        'c',
      ]);
    });
  });

  describe('insertAt', () => {
    it('inserts at the index', () => {
      expect(insertAt(['a', 'b', 'c'], 'x', 1)).toEqual(['a', 'x', 'b', 'c']);
    });

    it('clamps an index past the end and a negative index', () => {
      expect(insertAt(['a', 'b'], 'x', 99)).toEqual(['a', 'b', 'x']);
      expect(insertAt(['a', 'b'], 'x', -3)).toEqual(['x', 'a', 'b']);
    });
  });
});
