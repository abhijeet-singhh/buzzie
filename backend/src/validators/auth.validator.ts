import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .email("Invalid email address")
  .transform((val) => val.toLowerCase());

export const passwordSchema = z
  .string()
  .trim()
  .min(6, "Password must be at least 6 characters")
  .max(100, "Password too long");

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(50)
      .regex(/^[a-zA-Z\s]+$/, "Name can only contain letters and spaces"),
    email: emailSchema,
    password: passwordSchema,
    avatar: z.string().url().optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export type RegisterSchemaType = z.infer<typeof registerSchema>;
export type LoginSchemaType = z.infer<typeof loginSchema>;
