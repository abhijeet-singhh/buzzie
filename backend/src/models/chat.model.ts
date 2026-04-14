import mongoose, { Document, Schema } from "mongoose";

export interface ChatDocument extends Document {
  participants: mongoose.Types.ObjectId[];
  lastMessage?: mongoose.Types.ObjectId | null;
  lastMessageAt: Date;
  isGroup: boolean;
  groupName?: string | null;
  groupAvatar?: string | null;
  admins?: mongoose.Types.ObjectId[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const chatSchema = new Schema<ChatDocument>(
  {
    participants: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      required: true,
      validate: {
        validator: function (val: mongoose.Types.ObjectId[]) {
          return val.length >= 2;
        },
        message: "A chat must have at least 2 participants",
      },
    },
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: () => new Date(),
    },
    isGroup: {
      type: Boolean,
      default: false,
    },
    groupName: {
      type: String,
      default: null,
      // Required only when it's a group chat
      required: function (this: ChatDocument) {
        return this.isGroup;
      },
      trim: true,
    },
    groupAvatar: {
      type: String,
      default: null,
    },
    //TODO: When creating group set creator as admin
    admins: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      validate: {
        validator: function (
          this: ChatDocument,
          val: mongoose.Types.ObjectId[],
        ) {
          if (this.isGroup) return Array.isArray(val) && val.length > 0;
          return true;
        },
        message: "Group must have at least one admin",
      },
      required: function (this: ChatDocument) {
        return this.isGroup;
      },
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// TODO: After sending a message, update the chat with:
// - lastMessage (set to the newly created message ID)
// - lastMessageAt (set current timestamp for proper chat sorting)

chatSchema.index({ participants: 1, lastMessageAt: -1 });

// TODO: Ensure participants are sorted before saving a chat to guarantee consistent ordering,
// so that the unique index correctly prevents duplicate 1-to-1 chats (e.g., [A, B] vs [B, A])

chatSchema.index(
  { participants: 1 },
  { unique: true, partialFilterExpression: { isGroup: false } },
);
// helps when - filtering group chats seperately and admin dashboards
chatSchema.index({ isGroup: 1, updatedAt: -1 });

const ChatModel = mongoose.model<ChatDocument>("Chat", chatSchema);
export default ChatModel;
