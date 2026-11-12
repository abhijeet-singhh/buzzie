import { type ZodType } from "zod";

export const validate = <T>(schema: ZodType<T>, data: unknown): T => {
  return schema.parse(data);
};
