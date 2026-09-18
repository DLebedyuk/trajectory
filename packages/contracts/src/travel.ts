import { z } from 'zod';
import { dateOnly, uuid } from './common.js';

/**
 * Фиксированный набор тегов для MVP — без пользовательских тегов и без
 * rule engine (см. ТЗ раздела «Поездки», п.6-7). `heat`/`cold` в алгоритме
 * генерации нигде автоматически не выставляются (погоды в MVP нет), но
 * остаются доступны для ручной разметки вещей и будущего расширения.
 */
export const travelTag = z.enum([
  'always',
  'heat',
  'cold',
  'rain',
  'sea',
  'work',
  'plane',
  'train',
  'car',
  'shortTrip',
  'longTrip',
]);
export type TravelTag = z.infer<typeof travelTag>;

export const TRAVEL_TAG_LABELS: Record<TravelTag, string> = {
  always: 'всегда',
  heat: 'жара',
  cold: 'холод',
  rain: 'дождь',
  sea: 'море',
  work: 'работа',
  plane: 'самолёт',
  train: 'поезд',
  car: 'машина',
  shortTrip: 'короткая поездка',
  longTrip: 'длинная поездка',
};

export const travelCategorySchema = z.object({
  id: uuid,
  userId: uuid,
  name: z.string().min(1).max(60),
  sortOrder: z.number().int(),
});
export type TravelCategory = z.infer<typeof travelCategorySchema>;
export const createTravelCategorySchema = z.object({ name: z.string().min(1).max(60) });

export const travelItemSchema = z.object({
  id: uuid,
  userId: uuid,
  name: z.string().min(1).max(200),
  categoryId: uuid.nullable(),
  categoryName: z.string().nullable(),
  tags: z.array(travelTag),
  alwaysInclude: z.boolean(),
  archived: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TravelItem = z.infer<typeof travelItemSchema>;

export const createTravelItemSchema = z.object({
  name: z.string().min(1).max(200),
  categoryId: uuid.nullish(),
  tags: z.array(travelTag).default([]),
  alwaysInclude: z.boolean().default(false),
});
export type CreateTravelItemInput = z.infer<typeof createTravelItemSchema>;
export const updateTravelItemSchema = createTravelItemSchema.partial().extend({
  archived: z.boolean().optional(),
});
export type UpdateTravelItemInput = z.infer<typeof updateTravelItemSchema>;

export const tripPurpose = z.enum(['rest', 'work', 'study', 'guests', 'other']);
export type TripPurpose = z.infer<typeof tripPurpose>;
export const TRIP_PURPOSE_LABELS: Record<TripPurpose, string> = {
  rest: 'отдых',
  work: 'работа',
  study: 'учёба',
  guests: 'гости',
  other: 'другое',
};

export const tripTransport = z.enum(['plane', 'train', 'car', 'bus', 'other']);
export type TripTransport = z.infer<typeof tripTransport>;
export const TRIP_TRANSPORT_LABELS: Record<TripTransport, string> = {
  plane: 'самолёт',
  train: 'поезд',
  car: 'машина',
  bus: 'автобус',
  other: 'другое',
};

export const tripStatus = z.enum(['planning', 'done']);
export type TripStatus = z.infer<typeof tripStatus>;

export const tripConditionsSchema = z.object({
  canLaundry: z.boolean().default(false),
  needsLaptop: z.boolean().default(false),
  seaOrPool: z.boolean().default(false),
  activeOutdoor: z.boolean().default(false),
  specialEvent: z.boolean().default(false),
  comment: z.string().max(500).nullable().default(null),
});
export type TripConditions = z.infer<typeof tripConditionsSchema>;

export const tripSchema = z.object({
  id: uuid,
  userId: uuid,
  /** Необязательно: если не задано, на экране показывается city ?? country. */
  name: z.string().max(200).nullable(),
  country: z.string().max(120),
  city: z.string().max(120).nullable(),
  startDate: dateOnly,
  endDate: dateOnly,
  purposes: z.array(tripPurpose),
  transport: z.array(tripTransport),
  conditions: tripConditionsSchema,
  status: tripStatus,
  /** Момент первой генерации чек-листа — null, пока кнопка ещё не нажата. */
  checklistGeneratedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Trip = z.infer<typeof tripSchema>;

export const tripWithStatsSchema = tripSchema.extend({
  totalCount: z.number().int(),
  packedCount: z.number().int(),
  needToBuyCount: z.number().int(),
});
export type TripWithStats = z.infer<typeof tripWithStatsSchema>;

export const createTripSchema = z.object({
  country: z.string().min(1).max(120),
  city: z.string().max(120).nullish(),
  startDate: dateOnly,
  endDate: dateOnly,
  purposes: z.array(tripPurpose).default([]),
  transport: z.array(tripTransport).default([]),
  conditions: tripConditionsSchema.partial().default({}),
});
export type CreateTripInput = z.infer<typeof createTripSchema>;

export const updateTripSchema = z.object({
  name: z.string().max(200).nullish(),
  country: z.string().min(1).max(120).optional(),
  city: z.string().max(120).nullish(),
  startDate: dateOnly.optional(),
  endDate: dateOnly.optional(),
  purposes: z.array(tripPurpose).optional(),
  transport: z.array(tripTransport).optional(),
  conditions: tripConditionsSchema.partial().optional(),
  status: tripStatus.optional(),
});
export type UpdateTripInput = z.infer<typeof updateTripSchema>;

export const tripChecklistItemSchema = z.object({
  id: uuid,
  tripId: uuid,
  travelItemId: uuid.nullable(),
  title: z.string().min(1).max(200),
  categoryId: uuid.nullable(),
  categoryName: z.string().nullable(),
  packed: z.boolean(),
  needToBuy: z.boolean(),
  quantity: z.number().int().min(1),
  note: z.string().max(500).nullable(),
  sortOrder: z.number().int(),
});
export type TripChecklistItem = z.infer<typeof tripChecklistItemSchema>;

export const createTripChecklistItemSchema = z.object({
  title: z.string().min(1).max(200),
  categoryId: uuid.nullish(),
  quantity: z.number().int().min(1).default(1),
  note: z.string().max(500).nullish(),
});
export type CreateTripChecklistItemInput = z.infer<typeof createTripChecklistItemSchema>;

export const updateTripChecklistItemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  categoryId: uuid.nullish(),
  packed: z.boolean().optional(),
  needToBuy: z.boolean().optional(),
  quantity: z.number().int().min(1).optional(),
  note: z.string().max(500).nullish(),
});
export type UpdateTripChecklistItemInput = z.infer<typeof updateTripChecklistItemSchema>;
