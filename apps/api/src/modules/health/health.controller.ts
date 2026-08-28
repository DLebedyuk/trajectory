import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { DB, type Database } from '../../db/db.module.js';
import { isDevAuthEnabled } from '../../config/env.js';

@ApiTags('system')
@Controller()
export class HealthController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get('health')
  health() {
    return { status: 'ok', devAuth: isDevAuthEnabled, uptime: Math.round(process.uptime()) };
  }

  @Get('ready')
  async ready() {
    try {
      await this.db.execute(sql`select 1`);
      return { status: 'ready', database: 'ok' };
    } catch (e) {
      return { status: 'degraded', database: e instanceof Error ? e.message : 'error' };
    }
  }
}
