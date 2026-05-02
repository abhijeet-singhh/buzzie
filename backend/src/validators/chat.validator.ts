import { z } from "zod";

// 1-to-1 chat
const singleChatSchema = z.object({
  isGroup: z.literal(false).optional(),
  participantId: z.string().trim().min(1),
});

// Group chat
const groupChatSchema = z.object({
  isGroup: z.literal(true),
  participants: z
    .array(z.string().trim().min(1))
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
  id: z.string().trim().min(1),
});
