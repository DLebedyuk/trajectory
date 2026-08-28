import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/http-exception.filter.js';
import { assertAuthConfiguration, env } from './config/env.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  assertAuthConfiguration(logger);

  const app = await NestFactory.create(AppModule, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
  });
  app.useGlobalFilters(new AllExceptionsFilter());

  const config = new DocumentBuilder()
    .setTitle('Траектория API')
    .setDescription('Личный планировщик: направления, проекты, задачи, касания, напоминания.')
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(env.PORT, '0.0.0.0');
  logger.log(`API на http://localhost:${env.PORT} · Swagger на /docs`);
}

void bootstrap();
