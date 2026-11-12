import mongoose from "mongoose";
import cloudinary from "../config/cloudinary.config";
import { validateMediaPayload } from "../config/media.config";
import ChatModel from "../models/chat.model";
import MessageModel from "../models/message.model";
import { BadRequestException, NotFoundException } from "../utils/app-error";
import {
  emitLastMessageToParticipants,
  emitMessageDeleted,
  emitMessageRead,
  emitMessageUpdated,
  emitNewMessageToChatRoom,
} from "../lib/socket";

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

  if (messageType !== "text") {
    if (!mediaUrl) {
      throw new BadRequestException("mediaUrl is required for media messages");
    }

    validateMediaPayload(messageType, mediaUrl);

    const uploadRes = await cloudinary.uploader.upload(mediaUrl, {
      folder: "chat-app",
      resource_type: "auto",
      timeout: 60_000,
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
  chat.lastMessage = newMessage._id;
  chat.lastMessageAt = newMessage.createdAt;

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

  // websocket emit the new message to the chat room
  emitNewMessageToChatRoom(chatId, newMessage);

  // websocket emit the last message to members (personal room user)
  const allParticipantIds = chat.participants.map((id) => id.toString());
  emitLastMessageToParticipants(allParticipantIds, chatId, newMessage);

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
    since?: Date;
    limit?: number;
  },
) => {
  const { chatId, cursor, since, limit = 20 } = query;

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

  if (since) {
    messageQuery.createdAt = { $gt: since };
  }

  // Fetch messages. `since` returns oldest-first for reconnect backfill.
  const messages = await MessageModel.find(messageQuery)
    .select("-isRead")
    .sort(since ? { createdAt: 1, _id: 1 } : { _id: -1 })
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
    !since && messages.length === limit
      ? messages[messages.length - 1]._id
      : null;

  const nextSince =
    since && messages.length === limit
      ? messages[messages.length - 1].createdAt
      : null;

  return {
    messages,
    nextCursor,
    ...(since ? { nextSince } : {}),
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

  const lastReadAt = new Date();
  const readEntry = chat.lastReadBy.find(
    (entry) => entry.user.toString() === userId,
  );

  if (readEntry) {
    readEntry.lastReadAt = lastReadAt;
  } else {
    chat.lastReadBy.push({ user: userObjectId, lastReadAt });
  }

  await chat.save();

  emitMessageRead(chatId, userId, lastReadAt);

  return { success: true, lastReadAt };
};

export const deleteMessageService = async (
  userId: string,
  chatId: string,
  messageId: string,
) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const chatObjectId = new mongoose.Types.ObjectId(chatId);
  const messageObjectId = new mongoose.Types.ObjectId(messageId);

  const message = await MessageModel.findOne({
    _id: messageObjectId,
    chatId: chatObjectId,
    sender: userObjectId,
    isDeleted: false,
  });

  if (!message) {
    throw new NotFoundException("Message not found or unauthorized");
  }

  message.isDeleted = true;
  await message.save();

  emitMessageDeleted(chatId, messageId);

  return { success: true };
};

export const editMessageService = async (
  userId: string,
  chatId: string,
  messageId: string,
  content: string,
) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const chatObjectId = new mongoose.Types.ObjectId(chatId);
  const messageObjectId = new mongoose.Types.ObjectId(messageId);

  const message = await MessageModel.findOne({
    _id: messageObjectId,
    chatId: chatObjectId,
    isDeleted: false,
  }).select("-isRead");

  if (!message || !message.sender || message.sender.toString() !== userId) {
    throw new NotFoundException("Message not found or you are not the sender");
  }

  if (message.messageType !== "text") {
    throw new BadRequestException("Only text messages can be edited");
  }

  message.content = content;
  message.editedAt = new Date();
  await message.save();

  await message.populate([
    { path: "sender", select: "name avatar" },
    {
      path: "replyTo",
      select: "content mediaUrl sender",
      populate: { path: "sender", select: "name avatar" },
    },
  ]);

  emitMessageUpdated(chatId, message);

  const chat = await ChatModel.findById(chatObjectId)
    .select("participants lastMessage")
    .lean();

  if (chat?.lastMessage?.toString() === messageId) {
    emitLastMessageToParticipants(
      chat.participants.map((id) => id.toString()),
      chatId,
      message,
    );
  }

  return message;
};

export const pinMessageService = async (
  userId: string,
  chatId: string,
  messageId: string,
  pinned: boolean,
) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const chatObjectId = new mongoose.Types.ObjectId(chatId);
  const messageObjectId = new mongoose.Types.ObjectId(messageId);

  const chat = await ChatModel.findOne({
    _id: chatObjectId,
    participants: { $in: [userObjectId] },
  })
    .select("_id")
    .lean();

  if (!chat) {
    throw new BadRequestException("Chat not found or unauthorized");
  }

  const message = await MessageModel.findOne({
    _id: messageObjectId,
    chatId: chatObjectId,
    isDeleted: false,
  }).select("-isRead");

  if (!message) {
    throw new NotFoundException("Message not found");
  }

  message.isPinned = pinned;
  message.pinnedBy = pinned ? userObjectId : null;
  message.pinnedAt = pinned ? new Date() : null;
  await message.save();

  await message.populate([
    { path: "sender", select: "name avatar" },
    {
      path: "replyTo",
      select: "content mediaUrl sender",
      populate: { path: "sender", select: "name avatar" },
    },
  ]);

  emitMessageUpdated(chatId, message);

  return message;
};

export const getPinnedMessagesService = async (
  userId: string,
  query: { chatId: string; page?: number; limit?: number },
) => {
  const { chatId, page = 1, limit = 20 } = query;
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const chatObjectId = new mongoose.Types.ObjectId(chatId);

  const chat = await ChatModel.findOne({
    _id: chatObjectId,
    participants: { $in: [userObjectId] },
  })
    .select("_id")
    .lean();

  if (!chat) {
    throw new BadRequestException("Chat not found or unauthorized");
  }

  const filter = {
    chatId: chatObjectId,
    isPinned: true,
    isDeleted: false,
  };
  const skip = (page - 1) * limit;

  const [messages, total] = await Promise.all([
    MessageModel.find(filter)
      .select("-isRead")
      .sort({ pinnedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate("sender", "name avatar")
      .populate({
        path: "replyTo",
        select: "content mediaUrl sender",
        populate: { path: "sender", select: "name avatar" },
      })
      .lean(),
    MessageModel.countDocuments(filter),
  ]);

  return {
    messages,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const searchMessagesService = async (
  userId: string,
  query: {
    q: string;
    chatId?: string;
    page?: number;
    limit?: number;
  },
) => {
  const { q, chatId, page = 1, limit = 20 } = query;
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const skip = (page - 1) * limit;

  let chatIds: mongoose.Types.ObjectId[];

  if (chatId) {
    const chatObjectId = new mongoose.Types.ObjectId(chatId);
    const chat = await ChatModel.findOne({
      _id: chatObjectId,
      participants: { $in: [userObjectId] },
    })
      .select("_id")
      .lean();

    if (!chat) {
      throw new BadRequestException("Chat not found or unauthorized");
    }

    chatIds = [chatObjectId];
  } else {
    const chats = await ChatModel.find({ participants: userObjectId })
      .select("_id")
      .lean();
    chatIds = chats.map((chat) => chat._id);
  }

  if (chatIds.length === 0) {
    return {
      messages: [],
      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 0,
      },
    };
  }

  const filter = {
    chatId: { $in: chatIds },
    isDeleted: false,
    $text: { $search: q },
  };

  const [messages, total] = await Promise.all([
    MessageModel.find(filter)
      .select("-isRead")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate("sender", "name avatar")
      .populate({
        path: "replyTo",
        select: "content mediaUrl sender",
        populate: { path: "sender", select: "name avatar" },
      })
      .lean(),
    MessageModel.countDocuments(filter),
  ]);

  return {
    messages,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};
