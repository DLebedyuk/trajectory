import { Module } from '@nestjs/common';
import { TravelItemsController } from './travel-items.controller.js';
import { TravelItemsService } from './travel-items.service.js';
import { TripsController } from './trips.controller.js';
import { TripsService } from './trips.service.js';

@Module({
  controllers: [TravelItemsController, TripsController],
  providers: [TravelItemsService, TripsService],
  exports: [TravelItemsService, TripsService],
})
export class TravelModule {}
