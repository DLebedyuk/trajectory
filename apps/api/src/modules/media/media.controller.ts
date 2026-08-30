import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createMediaCategorySchema,
  createMediaItemSchema,
  updateMediaItemSchema,
} from '@planner/contracts';
import { CurrentUser, AuthGuard } from '../../common/current-user.js';
import { zodBody } from '../../common/zod.pipe.js';
import { MediaService } from './media.service.js';

@ApiTags('media')
@UseGuards(AuthGuard)
@Controller('api/media')
export class MediaController {
  constructor(@Inject(MediaService) private readonly service: MediaService) {}

  @Get()
  list(
    @CurrentUser() userId: string,
    @Query('kind') kind?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.service.list(userId, kind, categoryId);
  }

  @Get('pinned')
  pinned(@CurrentUser() userId: string) {
    return this.service.listPinned(userId);
  }

  @Get('categories')
  categories(@CurrentUser() userId: string) {
    return this.service.categories(userId);
  }

  @Post('categories')
  createCategory(
    @CurrentUser() userId: string,
    @Body(zodBody(createMediaCategorySchema)) body: unknown,
  ) {
    return this.service.createCategory(userId, (body as { name: string }).name);
  }

  @Delete('categories/:id')
  removeCategory(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.removeCategory(userId, id);
  }

  @Get(':id')
  get(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.get(userId, id);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body(zodBody(createMediaItemSchema)) body: unknown) {
    return this.service.create(userId, body as never);
  }

  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(zodBody(updateMediaItemSchema)) body: unknown,
  ) {
    return this.service.update(userId, id, body as never);
  }

  @Post(':id/pin')
  pin(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.setPinned(userId, id, true);
  }

  @Post(':id/unpin')
  unpin(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.setPinned(userId, id, false);
  }

  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.remove(userId, id);
  }
}
