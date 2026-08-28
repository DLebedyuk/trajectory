import { Body, Controller, Get, Inject, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { updateSettingsSchema } from '@planner/contracts';
import { CurrentUser, DevAuthGuard } from '../../common/current-user.js';
import { zodBody } from '../../common/zod.pipe.js';
import { SettingsService } from './settings.service.js';

@ApiTags('settings')
@UseGuards(DevAuthGuard)
@Controller('api')
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly service: SettingsService) {}

  @Get('me')
  me(@CurrentUser() userId: string) {
    return this.service.me(userId);
  }

  @Get('settings')
  get(@CurrentUser() userId: string) {
    return this.service.get(userId);
  }

  @Patch('settings')
  update(@CurrentUser() userId: string, @Body(zodBody(updateSettingsSchema)) body: unknown) {
    return this.service.update(userId, body as never);
  }
}
