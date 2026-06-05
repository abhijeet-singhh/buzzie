import mongoose from "mongoose";
import cloudinary from "../config/cloudinary.config";
import ChatModel from "../models/chat.model";
import MessageModel from "../models/message.model";
import { BadRequestException, NotFoundException } from "../utils/app-error";

// Response type
type SendMessageResponse = {
  message: any;
  chat: any;
};

export const sendMessageService = async (
  userId: string,
  body: {
    chatId: string;
    messageType: "text" | "image" | "audio" | "video" | "file";
    content?: string;
    mediaUrl?: string;
    replyToId?: string;
  },
): Promise<SendMessageResponse> => {
  const { chatId, messageType, content, mediaUrl, replyToId } = body;

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const chatObjectId = new mongoose.Types.ObjectId(chatId);

  // VERIFY CHAT ACCESS
  const chat = await ChatModel.findOne({
    _id: chatObjectId,
    participants: { $in: [userObjectId] },
  });

  if (!chat) {
    throw new BadRequestException("Chat not found or unauthorized");
  }

  // HANDLE MEDIA (Cloudinary)
  let uploadedMediaUrl: string | undefined;

  if (mediaUrl) {
    const uploadRes = await cloudinary.uploader.upload(mediaUrl, {
      folder: "chat-app",
    });
    uploadedMediaUrl = uploadRes.secure_url;
  }

  // VALIDATE REPLY MESSAGE
  let replyMessage = null;

  if (replyToId) {
    const replyObjectId = new mongoose.Types.ObjectId(replyToId);

    replyMessage = await MessageModel.findOne({
      _id: replyObjectId,
      chatId: chatObjectId,
      isDeleted: false,
    });

    if (!replyMessage) {
      throw new NotFoundException("Reply message not found");
    }
  }

  // CREATE MESSAGE
  const newMessage = await MessageModel.create({
    chatId: chatObjectId,
    sender: userObjectId,
    messageType,
    content: messageType === "text" ? content : undefined,
    mediaUrl: messageType !== "text" ? uploadedMediaUrl : undefined,
    replyTo: replyToId ? new mongoose.Types.ObjectId(replyToId) : null,
  });

  // UPDATE CHAT (CRITICAL)
  await ChatModel.findByIdAndUpdate(chatObjectId, {
    lastMessage: newMessage._id,
    lastMessageAt: newMessage.createdAt,
  });

  // POPULATE MESSAGE
  await newMessage.populate([
    {
      path: "sender",
      select: "name avatar",
    },
    {
      path: "replyTo",
      select: "content mediaUrl sender",
      populate: {
        path: "sender",
        select: "name avatar",
      },
    },
  ]);

  // RETURN RESPONSE
  return {
    message: newMessage,
    chat,
  };
};

export const getMessagesService = async (
  userId: string,
  query: {
    chatId: string;
    cursor?: string;
    limit?: number;
  },
) => {
  const { chatId, cursor, limit = 20 } = query;

  const chatObjectId = new mongoose.Types.ObjectId(chatId);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Verify user is part of chat
  const chat = await ChatModel.findOne({
    _id: chatObjectId,
    participants: { $in: [userObjectId] },
  });

  if (!chat) {
    throw new BadRequestException("Unauthorized or chat not found");
  }

  // Build query
  const messageQuery: any = {
    chatId: chatObjectId,
    isDeleted: false,
  };

  if (cursor) {
    messageQuery._id = { $lt: new mongoose.Types.ObjectId(cursor) };
  }

  // Fetch messages
  const messages = await MessageModel.find(messageQuery)
    .sort({ _id: -1 }) // newest first
    .limit(limit)
    .populate("sender", "name avatar")
    .populate({
      path: "replyTo",
      select: "content mediaUrl sender",
      populate: {
        path: "sender",
        select: "name avatar",
      },
    })
    .lean();

  // Prepare next cursor
  const nextCursor =
    messages.length === limit ? messages[messages.length - 1]._id : null;

  return {
    messages,
    nextCursor,
  };
};

export const markAsReadService = async (userId: string, chatId: string) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const chatObjectId = new mongoose.Types.ObjectId(chatId);

  const chat = await ChatModel.findOne({
    _id: chatObjectId,
    participants: { $in: [userObjectId] },
  });

  if (!chat) {
    throw new BadRequestException("Unauthorized or chat not found");
  }

  await ChatModel.updateOne(
    {
      _id: chatObjectId,
      "lastReadBy.user": userObjectId,
    },
    {
      $set: {
        "lastReadBy.$.lastReadAt": new Date(),
      },
    },
  );

  return { success: true };
};
