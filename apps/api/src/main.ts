import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/http-exception.filter.js';
import { assertAuthConfiguration, env } from './config/env.js';
import { BadEncryptionKeyError, encryptionKeyProblem } from './common/crypto.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  assertAuthConfiguration(logger);

  // кривой ключ шифрования лучше поймать при старте, чем в момент, когда
  // человек уже прошёл согласие Google и ждёт подключения календаря
  const keyProblem = encryptionKeyProblem();
  if (keyProblem instanceof BadEncryptionKeyError) throw keyProblem;
  if (keyProblem) logger.warn(keyProblem.message);

  const app = await NestFactory.create(AppModule, {
    // http://tauri.localhost — фиксированный адрес десктоп-обёртки (Tauri на
    // Windows отдаёт фронтенд с него, useHttpsScheme не включён). Подделать
    // его с постороннего сайта нельзя, поэтому он разрешён всегда, а не
    // только там, где есть desktop-сборка.
    cors: { origin: [env.WEB_ORIGIN, 'http://tauri.localhost'], credentials: true },
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
