import { z } from "zod";

export const getUsersQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().min(1).optional(),
  limit: z.coerce.number().min(1).max(50).optional(),
});
