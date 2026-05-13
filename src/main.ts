import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // ─── Global API prefix (/api) — excludes root health check and Stripe webhook
  app.setGlobalPrefix('api', { exclude: ['health', 'billing/webhook'] });
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  // ─── CORS : autorise le frontend (Docker ou dev local)
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-hotel-id', 'x-api-key'],
    exposedHeaders: [
      'x-integration-endpoint-code',
      'x-integration-source',
      'x-integration-duration-ms',
      'x-integration-request-id',
      'x-integration-error-code',
    ],
  });

  // ─── Strict DTO validation via class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ─── HTTP request/response logging (timing + status)
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ─── Auto-serialize: respects @Exclude() on entity fields
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // ─── Normalize HTTP exceptions
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Server running on http://localhost:${port}`);
}
void bootstrap();
