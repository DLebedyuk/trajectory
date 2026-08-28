import { z } from 'zod';
import { uuid } from './common.js';

export const menuItemSchema = z.object({
  id: uuid,
  userId: uuid,
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(60),
  energy: z.enum(['low', 'medium', 'high']),
  estimatedTime: z.enum(['quick', 'hour', 'hours']),
  cost: z.enum(['free', 'cheap', 'budget']),
  place: z.enum(['home', 'out']),
  company: z.enum(['alone', 'withSomeone', 'any']),
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
  energy: z.enum(['low', 'medium', 'high']).optional(),
  estimatedTime: z.enum(['quick', 'hour', 'hours']).optional(),
  cost: z.enum(['free', 'cheap', 'budget']).optional(),
  place: z.enum(['home', 'out']).optional(),
  company: z.enum(['alone', 'withSomeone', 'any']).optional(),
});
export type MenuFilter = z.infer<typeof menuFilterSchema>;
