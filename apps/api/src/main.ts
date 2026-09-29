import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger, RequestMethod } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';
import type { Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/response.interceptor';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { ApiException } from './common/api.exception';
import { ValidationError } from 'class-validator';

const isProduction = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = new Logger('Bootstrap');

  // GcalWebhookController (`@Controller('hooks/gcal')`) is excluded from the
  // global prefix so its real route is `POST /hooks/gcal` — the path Google
  // is registered to call (GOOGLE_CALENDAR_WEBHOOK_URL must end in it).
  // Without this exclude the route would be `/api/hooks/gcal` and every push
  // notification would 404 (the 5-minute pg-boss poll would still cover it).
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'hooks/gcal', method: RequestMethod.POST }],
  });

  // Behind Cloudflare Tunnel in prod — trust the first hop so the throttler
  // keys on the real client IP from X-Forwarded-For instead of the proxy's IP.
  app.set('trust proxy', 1);

  app.use(helmet());

  // text/plain parser for Vault .env import endpoint (must register before global prefix matters)
  app.use(bodyParser.text({ type: 'text/plain', limit: '1mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
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

  const corsOrigins = (process.env.HUSREVITY_CORS_ORIGINS ?? 'http://localhost:3090')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: false });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Husrevity API')
    .setDescription('Personal productivity backend (NestJS port)')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

  // Raw OpenAPI JSON is public in every environment (mobile/CI client
  // generation needs it in prod) — served directly via the HTTP adapter,
  // deliberately bypassing Nest's guard pipeline since it's meant to be
  // public. The interactive Swagger UI stays dev-only below.
  app
    .getHttpAdapter()
    .getInstance()
    .get('/api/openapi.json', (_req: Request, res: Response) => res.json(swaggerDocument));

  if (!isProduction) {
    SwaggerModule.setup('api/docs', app, swaggerDocument);
  }

  const port = Number(process.env.HUSREVITY_PORT ?? 4090);
  await app.listen(port);
  logger.log(`Husrevity API listening on http://localhost:${port}/api`);
  if (!isProduction) {
    logger.log(`Swagger UI:http://localhost:${port}/api/docs`);
  }
}

bootstrap();
