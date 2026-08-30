import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { applyInboxProposalsSchema, createInboxItemSchema } from '@planner/contracts';
import { z } from 'zod';
import { CurrentUser, AuthGuard } from '../../common/current-user.js';
import { zodBody } from '../../common/zod.pipe.js';
import { InboxService } from './inbox.service.js';

@ApiTags('inbox')
@UseGuards(AuthGuard)
@Controller('api/inbox')
export class InboxController {
  constructor(@Inject(InboxService) private readonly service: InboxService) {}

  @Get()
  list(@CurrentUser() userId: string) {
    return this.service.list(userId);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body(zodBody(createInboxItemSchema)) body: unknown) {
    return this.service.create(userId, body as never);
  }

  /** Предпросмотр разбора. Ничего не сохраняет. */
  @Post('propose')
  propose(@CurrentUser() userId: string) {
    return this.service.propose(userId);
  }

  @Post('apply')
  apply(@CurrentUser() userId: string, @Body(zodBody(applyInboxProposalsSchema)) body: unknown) {
    return this.service.apply(userId, (body as { proposals: never[] }).proposals);
  }

  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(zodBody(z.object({ originalText: z.string().min(1).max(2000) }))) body: unknown,
  ) {
    return this.service.update(userId, id, (body as { originalText: string }).originalText);
  }

  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.remove(userId, id);
  }
}
