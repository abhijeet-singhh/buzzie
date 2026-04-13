import mongoose, { Document, HydratedDocument, Schema } from "mongoose";
import { compareValue, hashValue } from "../utils/bcrypt";

export interface UserDocument extends Document {
  name: string;
  email: string;
  password: string;
  avatar?: string | null;
  isOnline: boolean;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(val: string): Promise<boolean>;
}

const userSchema = new Schema<UserDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
      match: [/^\S+@\S+\.\S+$/, "Please use a valid email address"],
    },
    password: { type: String, required: true },
    avatar: { type: String, default: null },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete (ret as any).password;
        return ret;
      },
    },
  },
);

userSchema.index({ email: 1, createdAt: -1 });

userSchema.pre("save", async function (this: HydratedDocument<UserDocument>) {
  if (this.password && this.isModified("password")) {
    this.password = await hashValue(this.password);
  }
});

userSchema.methods.comparePassword = async function (
  val: string,
): Promise<boolean> {
  return compareValue(val, this.password);
};

const UserModel = mongoose.model<UserDocument>("User", userSchema);
export default UserModel;
