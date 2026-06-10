import { z } from "zod";

const base = z
  .object({
    chatId: z.string().trim().min(1),
    replyToId: z.string().trim().optional(),
  })
  .strict();

export const sendMessageSchema = z.discriminatedUnion("messageType", [
  // TEXT MESSAGE
  base.extend({
    messageType: z.literal("text"),
    content: z.string().trim().min(1),
  }),

  // MEDIA MESSAGE
  base.extend({
    messageType: z.enum(["image", "audio", "video", "file"]),
    mediaUrl: z.string().trim().min(1),
  }),
]);

export const getMessagesQuerySchema = z.object({
  chatId: z.string().trim().min(1),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).optional(),
});

export const markAsReadSchema = z.object({
  chatId: z.string().trim().min(1),
});

export const deleteMessageSchema = z.object({
  chatId: z.string().trim().min(1),
  messageId: z.string().trim().min(1),
});
