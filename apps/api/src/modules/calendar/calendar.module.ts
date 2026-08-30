import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service.js';
import { CalendarController, CalendarCallbackController } from './calendar.controller.js';
import { GOOGLE_CALENDAR_API, RealGoogleCalendarApi } from './google-calendar.api.js';

@Module({
  controllers: [CalendarController, CalendarCallbackController],
  providers: [CalendarService, { provide: GOOGLE_CALENDAR_API, useClass: RealGoogleCalendarApi }],
  exports: [CalendarService],
})
export class CalendarModule {}
