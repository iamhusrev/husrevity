import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { ResponseInterceptor } from '../src/common/response.interceptor';
import { GlobalExceptionFilter } from '../src/common/global-exception.filter';

/**
 * E2E smoke test mirroring SmokeTest.java in the Spring project.
 * Boots the whole AppModule, hits register → login → /me, asserts envelope shape.
 *
 * Pre-requisites:
 *   - shared-infra postgres up on :5432 with husrevity_nest db
 *   - migrations applied: bun run migration:run
 *   - apps/api/.env exists with HUSREVITY_JWT_SECRET / HUSREVITY_CRYPTO_KEY filled
 */
describe('SmokeTest (e2e)', () => {
  let app: INestApplication;
  const email = `smoke-${Date.now()}@test.local`;
  const password = 'testpass123';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers, logs in, and returns /me', async () => {
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, firstName: 'Smoke', lastName: 'Test' })
      .expect(201);

    expect(reg.body.success).toBe(true);
    expect(reg.body.data.accessToken).toBeDefined();
    expect(reg.body.data.refreshToken).toBeDefined();
    expect(reg.body.data.user.email).toBe(email);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const accessToken = login.body.data.accessToken;
    expect(accessToken).toBeDefined();

    const me = await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.success).toBe(true);
    expect(me.body.data.email).toBe(email);
  });
});
