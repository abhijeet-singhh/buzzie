import mongoose from "mongoose";
import { Env } from "./env.config";
import { logger } from "../lib/logger";

const connectDatabase = async () => {
  try {
    await mongoose.connect(Env.MONGO_URI);
    logger.info("Database connected");
  } catch (error) {
    logger.error({ err: error }, "Database connection error");
    process.exit(1);
  }
};

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Database operation timed out")),
      timeoutMs,
    );
    timer.unref?.();

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
};

export const checkDatabaseHealth = async (timeoutMs = 2000): Promise<boolean> => {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return false;
  }

  try {
    await withTimeout(mongoose.connection.db.admin().ping(), timeoutMs);
    return true;
  } catch {
    return false;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
};

export default connectDatabase;
