import { ApiException } from '../common/api.exception';
import { parseSuggestions, ParseContext } from './suggestion-parser';

describe('parseSuggestions', () => {
  const ctx: ParseContext = {
    validIds: new Set<string>([
      'note:n1',
      'reminder:r1',
      'project:p1',
      'project:pr1',
      'task:t1',
    ]),
  };

  function makeRow(overrides: Record<string, unknown> = {}): unknown {
    return {
      title: 'Su iç',
      description: 'Bir bardak su, sonra devam et.',
      kind: 'hobby',
      sourceRef: null,
      reasonShort: 'küçük bir mola',
      ...overrides,
    };
  }

  describe('happy path', () => {
    it('returns valid items unchanged (within length bounds)', () => {
      const raw = JSON.stringify([makeRow(), makeRow({ kind: 'task' })]);
      const out = parseSuggestions(raw, 3, ctx);
      expect(out).toHaveLength(2);
      expect(out[0].title).toBe('Su iç');
      expect(out[0].kind).toBe('hobby');
      expect(out[1].kind).toBe('task');
    });

    it('caps results at the requested count', () => {
      const raw = JSON.stringify([makeRow(), makeRow(), makeRow(), makeRow()]);
      const out = parseSuggestions(raw, 1, ctx);
      expect(out).toHaveLength(1);
    });

    it('strips markdown code fences before parsing', () => {
      const raw = '```json\n' + JSON.stringify([makeRow()]) + '\n```';
      const out = parseSuggestions(raw, 3, ctx);
      expect(out).toHaveLength(1);
    });
  });

  describe('malformed input', () => {
    it('throws ApiException on non-JSON', () => {
      expect(() => parseSuggestions('not json at all', 3, ctx)).toThrow(
        ApiException,
      );
    });

    it('throws ApiException when result is not an array', () => {
      const raw = JSON.stringify({ wrong: 'shape' });
      expect(() => parseSuggestions(raw, 3, ctx)).toThrow(ApiException);
    });

    it('throws ApiException when no usable items remain', () => {
      const raw = JSON.stringify([
        { title: '', description: 'no title' },
        { description: 'no title key' },
        null,
        'string',
      ]);
      expect(() => parseSuggestions(raw, 3, ctx)).toThrow(ApiException);
    });
  });

  describe('sourceRef validation', () => {
    it('keeps a sourceRef that hits the context whitelist', () => {
      const raw = JSON.stringify([
        makeRow({ sourceRef: { type: 'note', id: 'n1' } }),
      ]);
      const out = parseSuggestions(raw, 3, ctx);
      expect(out[0].sourceRef).toEqual({ type: 'note', id: 'n1' });
    });

    it('drops a sourceRef the model invented (id not in context)', () => {
      const raw = JSON.stringify([
        makeRow({ sourceRef: { type: 'note', id: 'made-up-99' } }),
      ]);
      const out = parseSuggestions(raw, 3, ctx);
      expect(out[0].sourceRef).toBeNull();
    });

    it('drops a sourceRef with an unknown type', () => {
      const raw = JSON.stringify([
        makeRow({ sourceRef: { type: 'gibberish', id: 'n1' } }),
      ]);
      const out = parseSuggestions(raw, 3, ctx);
      expect(out[0].sourceRef).toBeNull();
    });

    it('drops a sourceRef with the removed plan type', () => {
      const legacyCtx: ParseContext = {
        validIds: new Set([...ctx.validIds, 'plan:p1']),
      };
      const raw = JSON.stringify([
        makeRow({ sourceRef: { type: 'plan', id: 'p1' } }),
      ]);
      const out = parseSuggestions(raw, 3, legacyCtx);
      expect(out[0].sourceRef).toBeNull();
    });
  });

  describe('coercion and clamping', () => {
    it('falls back kind to "mixed" when invalid', () => {
      const raw = JSON.stringify([makeRow({ kind: 'unknown' })]);
      const out = parseSuggestions(raw, 3, ctx);
      expect(out[0].kind).toBe('mixed');
    });

    it('clamps over-long title / description / reasonShort', () => {
      const long = 'x'.repeat(500);
      const raw = JSON.stringify([
        makeRow({ title: long, description: long, reasonShort: long }),
      ]);
      const out = parseSuggestions(raw, 3, ctx);
      expect(out[0].title.length).toBeLessThanOrEqual(120);
      expect(out[0].description.length).toBeLessThanOrEqual(280);
      expect(out[0].reasonShort.length).toBeLessThanOrEqual(160);
    });
  });
});
