import { z } from "zod";
import { objectIdSchema } from "./common.validator";

export const getUsersQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const updateProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(50)
      .regex(/^[a-zA-Z\s]+$/, "Name can only contain letters and spaces")
      .optional(),
    avatar: z.string().url("Avatar must be a valid URL").nullable().optional(),
  })
  .strict()
  .refine((body) => body.name !== undefined || body.avatar !== undefined, {
    message: "At least one of name or avatar is required",
  });

const presenceIdsSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) =>
    value
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  )
  .pipe(z.array(objectIdSchema).min(1).max(50));

export const presenceQuerySchema = z.object({
  ids: presenceIdsSchema,
});
