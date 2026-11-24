import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import request = require('supertest');
import { PublicLegalController } from './public-legal.controller';
import { PublicLegalService } from './public-legal.service';
import { ResponseInterceptor } from '../common/response.interceptor';
import { IS_PUBLIC_KEY } from '../common/public.decorator';

describe('PublicLegalController', () => {
  let app: INestApplication;

  async function boot(env: Record<string, string | undefined>): Promise<void> {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PublicLegalController],
      providers: [
        PublicLegalService,
        { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.listen(0, '127.0.0.1');
  }

  afterEach(async () => {
    await app.close();
  });

  it('is public (reachable without a token)', async () => {
    await boot({});
    const handler = PublicLegalController.prototype.getLegal;
    expect(new Reflector().get(IS_PUBLIC_KEY, handler)).toBe(true);
  });

  it('GET /public/legal returns the envelope with identity read from env', async () => {
    await boot({
      LEGAL_OPERATOR_NAME: 'Example Operator',
      LEGAL_CONTACT_EMAIL: 'privacy@example.test',
    });

    const res = await request(app.getHttpServer()).get('/public/legal').expect(200);

    expect(res.body).toEqual({
      success: true,
      message: 'OK',
      code: 200,
      data: { operatorName: 'Example Operator', contactEmail: 'privacy@example.test' },
    });
  });

  it('returns nulls (never invented values) when env is missing, empty or blank', async () => {
    await boot({ LEGAL_OPERATOR_NAME: '', LEGAL_CONTACT_EMAIL: '   ' });

    const res = await request(app.getHttpServer()).get('/public/legal').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ operatorName: null, contactEmail: null });
  });

  it('returns nulls when env keys are absent', async () => {
    await boot({});

    const res = await request(app.getHttpServer()).get('/public/legal').expect(200);

    expect(res.body.data).toEqual({ operatorName: null, contactEmail: null });
  });
});
