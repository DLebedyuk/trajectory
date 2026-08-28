import { z } from 'zod';
import { dateOnly, inboxProposedType, inboxStatus, uuid } from './common.js';
import { deliveryMode } from './common.js';

export const inboxItemSchema = z.object({
  id: uuid,
  userId: uuid,
  originalText: z.string().min(1).max(2000),
  source: z.enum(['web', 'telegram']),
  status: inboxStatus,
  proposedType: inboxProposedType.nullable(),
  createdAt: z.string().datetime(),
  processedAt: z.string().datetime().nullable(),
});
export type InboxItem = z.infer<typeof inboxItemSchema>;

export const createInboxItemSchema = z.object({
  originalText: z.string().min(1).max(2000),
  source: z.enum(['web', 'telegram']).default('web'),
});
export type CreateInboxItemInput = z.infer<typeof createInboxItemSchema>;

/** Предложение разбора. Даты ИИ не выдумывает: пусто — значит спросить пользователя. */
export const inboxProposalSchema = z.object({
  inboxItemId: uuid,
  type: inboxProposedType,
  text: z.string().min(1).max(500),
  projectId: uuid.nullish(),
  deadline: dateOnly.nullish(),
  remindAt: dateOnly.nullish(),
  deliveryMode: deliveryMode.nullish(),
  comment: z.string().max(2000).nullish(),
  note: z.string().max(500).nullish(),
});
export type InboxProposal = z.infer<typeof inboxProposalSchema>;

export const applyInboxProposalsSchema = z.object({
  proposals: z.array(inboxProposalSchema).min(1),
});
export type ApplyInboxProposalsInput = z.infer<typeof applyInboxProposalsSchema>;

export const applyInboxResultSchema = z.object({
  applied: z.number().int(),
  skipped: z.array(z.object({ inboxItemId: uuid, reason: z.string() })),
});
export type ApplyInboxResult = z.infer<typeof applyInboxResultSchema>;
