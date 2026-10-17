import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';

type MockRepo = { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };

function makeContext(req: Record<string, unknown>, res: Record<string, unknown>) {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

describe('IdempotencyInterceptor', () => {
  let keys: MockRepo;
  let interceptor: IdempotencyInterceptor;

  beforeEach(() => {
    keys = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn().mockResolvedValue(undefined),
    };
    interceptor = new IdempotencyInterceptor(keys as never);
  });

  it('passes through untouched when no Idempotency-Key header is present', async () => {
    const req = { header: () => undefined, user: { userId: '1' } };
    const next: CallHandler = { handle: () => of({ id: '1' }) };

    const result$ = await interceptor.intercept(makeContext(req, {}), next);

    expect(keys.findOne).not.toHaveBeenCalled();
    await expect(firstValue(result$)).resolves.toEqual({ id: '1' });
  });

  it('replays the cached response and sets its original status when the key was already seen', async () => {
    keys.findOne.mockResolvedValueOnce({ responseStatus: 201, responseBody: { id: '10' } });
    const status = jest.fn();
    const req = { header: () => 'abc', user: { userId: '1' } };
    const next: CallHandler = { handle: jest.fn() };

    const result$ = await interceptor.intercept(makeContext(req, { status }), next);

    expect(next.handle).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(201);
    await expect(firstValue(result$)).resolves.toEqual({ id: '10' });
  });

  it('calls the real handler and persists the response when the key is new', async () => {
    keys.findOne.mockResolvedValueOnce(null);
    const req = { header: () => 'abc', method: 'POST', path: '/items', user: { userId: '1' } };
    const res = { statusCode: 201 };
    const next: CallHandler = { handle: () => of({ id: '10' }) };

    const result$ = await interceptor.intercept(makeContext(req, res), next);
    await firstValue(result$);
    await new Promise((r) => setImmediate(r)); // let the tap's fire-and-forget save settle

    expect(keys.save).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: '1',
        key: 'abc',
        method: 'POST',
        path: '/items',
        responseStatus: 201,
        responseBody: { id: '10' },
      }),
    );
  });

  it('does not deliver the response until the key is persisted, so an immediate retry replays it', async () => {
    keys.findOne.mockResolvedValueOnce(null);
    let release!: () => void;
    keys.save.mockReturnValueOnce(new Promise<void>((resolve) => (release = resolve)));
    const req = { header: () => 'abc', method: 'POST', path: '/items', user: { userId: '1' } };
    const next: CallHandler = { handle: () => of({ id: '10' }) };
    const emitted = jest.fn();

    const result$ = await interceptor.intercept(makeContext(req, { statusCode: 201 }), next);
    result$.subscribe(emitted);
    await new Promise((r) => setImmediate(r));

    expect(keys.save).toHaveBeenCalled();
    expect(emitted).not.toHaveBeenCalled();

    release();
    await new Promise((r) => setImmediate(r));
    expect(emitted).toHaveBeenCalledWith({ id: '10' });
  });

  it('persists a bodiless response (e.g. DELETE 204) as an empty object, never null', async () => {
    // response_body is JSONB NOT NULL: a null here made the save fail and the replay never happen.
    keys.findOne.mockResolvedValueOnce(null);
    const req = { header: () => 'abc', method: 'DELETE', path: '/notes/9', user: { userId: '1' } };
    const next: CallHandler = { handle: () => of(undefined) };

    const result$ = await interceptor.intercept(makeContext(req, { statusCode: 204 }), next);
    await firstValue(result$);

    expect(keys.save).toHaveBeenCalledWith(
      expect.objectContaining({ responseStatus: 204, responseBody: {} }),
    );
  });

  it('replays a stored 204 as an empty response, not as the placeholder object', async () => {
    keys.findOne.mockResolvedValueOnce({ responseStatus: 204, responseBody: {} });
    const status = jest.fn();
    const req = { header: () => 'abc', user: { userId: '1' } };
    const next: CallHandler = { handle: jest.fn() };

    const result$ = await interceptor.intercept(makeContext(req, { status }), next);

    expect(next.handle).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(204);
    await expect(firstValue(result$)).resolves.toBeUndefined();
  });

  it('still delivers the response when persisting the key fails', async () => {
    keys.findOne.mockResolvedValueOnce(null);
    keys.save.mockRejectedValueOnce(new Error('db down'));
    const req = { header: () => 'abc', method: 'POST', path: '/items', user: { userId: '1' } };
    const next: CallHandler = { handle: () => of({ id: '10' }) };

    const result$ = await interceptor.intercept(makeContext(req, { statusCode: 201 }), next);

    await expect(firstValue(result$)).resolves.toEqual({ id: '10' });
  });
});

function firstValue<T>(obs: { subscribe: (cb: (v: T) => void) => void }): Promise<T> {
  return new Promise((resolve) => obs.subscribe(resolve));
}
