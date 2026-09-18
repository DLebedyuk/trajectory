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
  createTravelCategorySchema,
  createTravelItemSchema,
  updateTravelItemSchema,
} from '@planner/contracts';
import { CurrentUser, AuthGuard } from '../../common/current-user.js';
import { zodBody } from '../../common/zod.pipe.js';
import { TravelItemsService } from './travel-items.service.js';

@ApiTags('travel')
@UseGuards(AuthGuard)
@Controller('api/travel')
export class TravelItemsController {
  constructor(@Inject(TravelItemsService) private readonly service: TravelItemsService) {}

  @Get('categories')
  categories(@CurrentUser() userId: string) {
    return this.service.categories(userId);
  }

  @Post('categories')
  createCategory(
    @CurrentUser() userId: string,
    @Body(zodBody(createTravelCategorySchema)) body: unknown,
  ) {
    return this.service.createCategory(userId, (body as { name: string }).name);
  }

  @Get('items')
  list(@CurrentUser() userId: string, @Query('includeArchived') includeArchived?: string) {
    return this.service.list(userId, includeArchived === 'true');
  }

  @Get('items/:id')
  get(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.get(userId, id);
  }

  @Post('items')
  create(@CurrentUser() userId: string, @Body(zodBody(createTravelItemSchema)) body: unknown) {
    return this.service.create(userId, body as never);
  }

  @Patch('items/:id')
  update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(zodBody(updateTravelItemSchema)) body: unknown,
  ) {
    return this.service.update(userId, id, body as never);
  }

  @Delete('items/:id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.remove(userId, id);
  }
}
