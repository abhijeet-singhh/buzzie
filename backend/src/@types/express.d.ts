import { UserDocument } from "../models/user.model";
import mongoose from "mongoose";

declare global {
  namespace Express {
    interface User extends UserDocument {
      _id: mongoose.Types.ObjectId;
    }
  }
}
