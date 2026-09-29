import { ExecutionContext } from '@nestjs/common';
import { PatAuthGuard } from './pat-auth.guard';
import { ApiException } from '../common/api.exception';

function makeContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('PatAuthGuard', () => {
  let pat: { validate: jest.Mock };
  let guard: PatAuthGuard;

  beforeEach(() => {
    pat = { validate: jest.fn() };
    guard = new PatAuthGuard(pat as never);
  });

  it('throws 401 when there is no Authorization header', async () => {
    const req = { header: () => undefined };
    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ApiException);
    expect(pat.validate).not.toHaveBeenCalled();
  });

  it('throws 401 when the header is not a Bearer token', async () => {
    const req = { header: () => 'Basic abc' };
    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ApiException);
  });

  it('throws 401 when the token fails PatService.validate', async () => {
    pat.validate.mockResolvedValueOnce(null);
    const req = { header: () => 'Bearer bad-token' };
    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ApiException);
  });

  it('attaches req.patAuth and returns true for a valid token', async () => {
    pat.validate.mockResolvedValueOnce({ ownerId: '1', scopes: ['items:read'] });
    const req: Record<string, unknown> = { header: () => 'Bearer good-token' };

    const result = await guard.canActivate(makeContext(req));

    expect(result).toBe(true);
    expect(req.patAuth).toEqual({ ownerId: '1', scopes: ['items:read'] });
    expect(pat.validate).toHaveBeenCalledWith('good-token');
  });
});
