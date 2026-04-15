import mongoose, { Document, Schema } from "mongoose";

export type MessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "file"
  | "system";

export interface MessageDocument extends Document {
  chatId: mongoose.Types.ObjectId;
  sender: mongoose.Types.ObjectId;
  content?: string;
  mediaUrl?: string;
  messageType: MessageType;
  replyTo?: mongoose.Types.ObjectId | null;
  isRead: boolean | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<MessageDocument>(
  {
    chatId: {
      type: Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: function (this: MessageDocument) {
        return this.messageType !== "system";
      },
      default: null,
    },
    messageType: {
      type: String,
      enum: ["text", "image", "audio", "video", "file", "system"],
      default: "text",
    },
    content: {
      type: String,
      trim: true,
    },
    mediaUrl: {
      type: String,
      default: null,
    },
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    isRead: {
      type: Boolean,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// Enforce: at least content or image must be present
messageSchema.pre("validate", function () {
  if (this.messageType === "text" && !this.content) {
    throw new Error("Text message must have content");
  }
  if (
    ["image", "audio", "video", "file"].includes(this.messageType) &&
    !this.mediaUrl
  ) {
    throw new Error(`${this.messageType} message must have mediaUrl`);
  }
  if (this.messageType !== "system" && !this.sender) {
    throw new Error("Sender required for non-system messages");
  }
});

// Core query: paginate messages in a chat by time
messageSchema.index({ chatId: 1, isDeleted: 1, createdAt: -1 });
// For unread count queries: "how many messages in chat X haven't been read by user Y"
messageSchema.index({ chatId: 1, sender: 1 });

const MessageModel = mongoose.model<MessageDocument>("Message", messageSchema);
export default MessageModel;
