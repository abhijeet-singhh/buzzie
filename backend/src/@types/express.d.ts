// src/@types/express.d.ts
import mongoose from "mongoose";

declare global {
  namespace Express {
    interface User {
      _id: mongoose.Types.ObjectId;
      name: string;
      email: string;
      avatar?: string | null;
    }
    interface Request {
      user?: User;
    }
  }
}

export {};
