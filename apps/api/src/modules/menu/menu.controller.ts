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
import { createMenuItemSchema, menuFilterSchema, updateMenuItemSchema } from '@planner/contracts';
import { CurrentUser, AuthGuard } from '../../common/current-user.js';
import { zodBody } from '../../common/zod.pipe.js';
import { MenuService } from './menu.service.js';

@ApiTags('menu')
@UseGuards(AuthGuard)
@Controller('api/menu')
export class MenuController {
  constructor(@Inject(MenuService) private readonly service: MenuService) {}

  @Get()
  list(@CurrentUser() userId: string, @Query() query: Record<string, string>) {
    return this.service.list(userId, menuFilterSchema.parse(query));
  }

  @Get('categories')
  categories(@CurrentUser() userId: string) {
    return this.service.categories(userId);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body(zodBody(createMenuItemSchema)) body: unknown) {
    return this.service.create(userId, body as never);
  }

  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(zodBody(updateMenuItemSchema)) body: unknown,
  ) {
    return this.service.update(userId, id, body as never);
  }

  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.remove(userId, id);
  }
}
