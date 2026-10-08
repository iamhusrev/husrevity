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
});

function firstValue<T>(obs: { subscribe: (cb: (v: T) => void) => void }): Promise<T> {
  return new Promise((resolve) => obs.subscribe(resolve));
}
