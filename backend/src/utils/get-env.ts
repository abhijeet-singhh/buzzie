export const getEnv = (key: string, defaultValue?: string): string => {
  const val = process.env[key];
  if (val !== undefined) return val;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error("Missing env variable: " + key);
};
