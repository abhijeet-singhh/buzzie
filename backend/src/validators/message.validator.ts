import { z } from "zod";
import { objectIdSchema, paginationQuerySchema } from "./common.validator";
import { isMediaUrlShapeValid } from "../config/media.config";

const base = z
  .object({
    chatId: objectIdSchema,
    replyToId: objectIdSchema.optional(),
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
    mediaUrl: z
      .string()
      .trim()
      .min(1)
      .max(10_000_000)
      .refine(isMediaUrlShapeValid, {
        message: "mediaUrl must be an http(s) URL or a base64 data URI",
      }),
  }),
]);

export const getMessagesQuerySchema = z
  .object({
    chatId: objectIdSchema,
    cursor: objectIdSchema.optional(),
    since: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .refine((query) => !(query.cursor && query.since), {
    message: "Use either cursor or since, not both",
    path: ["since"],
  });

export const markAsReadSchema = z.object({
  chatId: objectIdSchema,
});

export const deleteMessageSchema = z.object({
  chatId: objectIdSchema,
  messageId: objectIdSchema,
});

export const editMessageSchema = z.object({
  chatId: objectIdSchema,
  messageId: objectIdSchema,
});

export const editMessageBodySchema = z
  .object({
    content: z.string().trim().min(1).max(4000, "Message is too long"),
  })
  .strict();

export const pinMessageSchema = z.object({
  chatId: objectIdSchema,
  messageId: objectIdSchema,
});

export const pinMessageBodySchema = z
  .object({
    pinned: z.boolean(),
  })
  .strict();

export const searchMessagesQuerySchema = paginationQuerySchema
  .extend({
    q: z.string().trim().min(1).max(100),
    chatId: objectIdSchema.optional(),
  });

export const getPinnedMessagesQuerySchema = paginationQuerySchema.extend({
  chatId: objectIdSchema,
});
