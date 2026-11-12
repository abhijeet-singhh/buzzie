import { z } from "zod";
import { objectIdSchema, paginationQuerySchema } from "./common.validator";

// 1-to-1 chat
const singleChatSchema = z.object({
  isGroup: z.literal(false).optional(),
  participantId: objectIdSchema,
});

// Group chat
const groupChatSchema = z.object({
  isGroup: z.literal(true),
  participants: z
    .array(objectIdSchema)
    .min(2, "Group must have at least 2 participants")
    .refine(
      (arr) => new Set(arr).size === arr.length,
      "Participants must be unique",
    ),
  groupName: z.string().trim().min(1),
});

// Final schema
export const createChatSchema = z.union([singleChatSchema, groupChatSchema]);

export const chatIdSchema = z.object({
  id: objectIdSchema,
});

export const memberActionBodySchema = z.object({
  userId: objectIdSchema,
});

export const updateGroupNameBodySchema = z.object({
  groupName: z.string().trim().min(1),
});

export const updateGroupAvatarBodySchema = z.object({
  groupAvatar: z.string().trim().min(1),
});

export const getChatsQuerySchema = paginationQuerySchema;
