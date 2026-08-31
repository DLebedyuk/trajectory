import { z } from 'zod';
import { uuid } from './common.js';

/**
 * Единственное место, где живут значения параметров меню и их русские подписи.
 * Раньше наборы были продублированы в схеме, в фильтре и в форме на странице
 * меню, а входящие про них вообще не знали и полагались на defaults базы.
 */
export const menuEnergy = z.enum(['low', 'medium', 'high']);
export const menuEstimatedTime = z.enum(['quick', 'hour', 'hours']);
export const menuCost = z.enum(['free', 'cheap', 'budget']);
export const menuPlace = z.enum(['home', 'out']);
export const menuCompany = z.enum(['alone', 'withSomeone', 'any']);

export type MenuEnergy = z.infer<typeof menuEnergy>;
export type MenuEstimatedTime = z.infer<typeof menuEstimatedTime>;
export type MenuCost = z.infer<typeof menuCost>;
export type MenuPlace = z.infer<typeof menuPlace>;
export type MenuCompany = z.infer<typeof menuCompany>;

export const MENU_LABELS = {
  energy: { low: 'мало', medium: 'средне', high: 'много' },
  estimatedTime: { quick: '15 минут', hour: 'около часа', hours: 'несколько часов' },
  cost: { free: 'бесплатно', cheap: 'недорого', budget: 'нужен бюджет' },
  place: { home: 'дома', out: 'вне дома' },
  company: { alone: 'одной', withSomeone: 'с кем-то', any: 'всё равно' },
} as const;

export const MENU_FIELD_LABELS = {
  category: 'Категория',
  energy: 'Энергия',
  estimatedTime: 'Время',
  cost: 'Стоимость',
  place: 'Место',
  company: 'Компания',
} as const;

/**
 * Значения по умолчанию. Они показываются человеку в форме заранее выбранными,
 * а не подставляются молча на сервере: выбор должен быть виден до сохранения.
 */
export const MENU_DEFAULTS = {
  category: 'другое',
  energy: 'medium',
  estimatedTime: 'hour',
  cost: 'cheap',
  place: 'out',
  company: 'any',
} as const;

export const menuItemSchema = z.object({
  id: uuid,
  userId: uuid,
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(60),
  energy: menuEnergy,
  estimatedTime: menuEstimatedTime,
  cost: menuCost,
  place: menuPlace,
  company: menuCompany,
  comment: z.string().max(2000).nullable(),
  link: z.string().max(500).nullable(),
  tried: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MenuItem = z.infer<typeof menuItemSchema>;

export const createMenuItemSchema = menuItemSchema
  .omit({ id: true, userId: true, createdAt: true, updatedAt: true })
  .extend({
    comment: z.string().max(2000).nullish(),
    link: z.string().max(500).nullish(),
    tried: z.boolean().default(false),
  });
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export const updateMenuItemSchema = createMenuItemSchema.partial();
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;

export const menuFilterSchema = z.object({
  category: z.string().optional(),
  energy: menuEnergy.optional(),
  estimatedTime: menuEstimatedTime.optional(),
  cost: menuCost.optional(),
  place: menuPlace.optional(),
  company: menuCompany.optional(),
});
export type MenuFilter = z.infer<typeof menuFilterSchema>;
