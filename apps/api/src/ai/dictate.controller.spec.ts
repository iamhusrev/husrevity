import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request = require('supertest');
import { ValidationError } from 'class-validator';
import { DictateController } from './dictate.controller';
import { DictateService } from './dictate.service';
import { ResponseInterceptor } from '../common/response.interceptor';
import { GlobalExceptionFilter } from '../common/global-exception.filter';
import { ApiException } from '../common/api.exception';

describe('DictateController', () => {
  let app: INestApplication;
  let service: { splitIntoItems: jest.Mock };

  beforeEach(async () => {
    service = { splitIntoItems: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [DictateController],
      providers: [{ provide: DictateService, useValue: service }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: (errors: ValidationError[]) => {
          const messages = errors
            .map((e) => (e.constraints ? Object.values(e.constraints).join(', ') : e.property))
            .join('; ');
          return ApiException.badRequest(`Validation failed: ${messages}`);
        },
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /ai/dictate-items returns 200 with the split items', async () => {
    service.splitIntoItems.mockResolvedValue(['Buy milk', 'Call dentist']);

    const res = await request(app.getHttpServer())
      .post('/ai/dictate-items')
      .send({ text: 'buy milk and call the dentist' })
      .expect(200);

    expect(service.splitIntoItems).toHaveBeenCalledWith('buy milk and call the dentist');
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ items: ['Buy milk', 'Call dentist'] });
  });

  it('POST /ai/dictate-items with empty text returns a validation error', async () => {
    const res = await request(app.getHttpServer())
      .post('/ai/dictate-items')
      .send({ text: '' })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Validation failed');
    expect(service.splitIntoItems).not.toHaveBeenCalled();
  });
});
