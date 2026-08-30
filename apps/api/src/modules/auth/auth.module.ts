import { Global, Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { GOOGLE_OAUTH, RealGoogleOAuthClient } from './google-oauth.js';

/**
 * Глобальный: гвард с сессией нужен каждому контроллеру, а заводить импорт
 * AuthModule в полутора десятках модулей — лишний шум.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, { provide: GOOGLE_OAUTH, useClass: RealGoogleOAuthClient }],
  exports: [AuthService, GOOGLE_OAUTH],
})
export class AuthModule {}
