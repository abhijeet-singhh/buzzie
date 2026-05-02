import mongoose from "mongoose";
import ChatModel from "../models/chat.model";
import UserModel from "../models/user.model";
import { BadRequestException, NotFoundException } from "../utils/app-error";
import MessageModel from "../models/message.model";

// Helper: Convert string[] → sorted ObjectId[]
const toSortedObjectIds = (ids: string[]) => {
  return ids
    .map((id) => new mongoose.Types.ObjectId(id))
    .sort((a, b) => a.toString().localeCompare(b.toString()));
};

// Create or get chat
export const createChatService = async (
  userId: string,
  body:
    | { participantId: string }
    | { isGroup: true; participants: string[]; groupName: string },
) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // ONE-TO-ONE CHAT
  if ("participantId" in body) {
    const otherUserId = body.participantId;

    // Self chat prevention
    if (otherUserId === userId) {
      throw new BadRequestException("You cannot chat with yourself");
    }

    // Validate user exists
    const otherUser = await UserModel.findById(otherUserId);
    if (!otherUser) {
      throw new NotFoundException("User not found");
    }

    // Convert + sort participants
    const participants = toSortedObjectIds([userId, otherUserId]);

    // Check existing chat (index-friendly)
    const existingChat = await ChatModel.findOne({
      participants,
      isGroup: false,
    }).populate("participants", "name avatar isOnline");

    if (existingChat) return existingChat;

    try {
      const chat = await ChatModel.create({
        participants,
        isGroup: false,
        createdBy: userObjectId,
        lastReadBy: [
          { user: userObjectId, lastReadAt: new Date() },
          {
            user: new mongoose.Types.ObjectId(otherUserId),
            lastReadAt: new Date(),
          },
        ],
      });

      return chat;
    } catch (error: any) {
      // Handle race condition (duplicate key error)
      if (error.code === 11000) {
        return await ChatModel.findOne({
          participants,
          isGroup: false,
        }).populate("participants", "name avatar isOnline");
      }
      throw error;
    }
  }

  // GROUP CHAT
  if (body.isGroup) {
    const { participants, groupName } = body;

    // Self included check
    if (participants.includes(userId)) {
      throw new BadRequestException("Do not include yourself in participants");
    }

    // Validate all users exist
    const users = await UserModel.find({
      _id: { $in: participants },
    });

    if (users.length !== participants.length) {
      throw new NotFoundException("One or more users not found");
    }

    // Unique + include creator + sort
    const uniqueParticipants = Array.from(new Set([userId, ...participants]));

    const allParticipants = toSortedObjectIds(uniqueParticipants);

    // Minimum group size (>= 3 total users)
    if (allParticipants.length < 3) {
      throw new BadRequestException("Group must have at least 3 members");
    }

    const chat = await ChatModel.create({
      participants: allParticipants,
      isGroup: true,
      groupName,
      admins: [userObjectId],
      createdBy: userObjectId,
      lastReadBy: allParticipants.map((id) => ({
        user: id,
        lastReadAt: new Date(),
      })),
    });

    return chat;
  }

  throw new BadRequestException("Invalid chat creation payload");
};

export const getUserChatsService = async (userId: string) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const chats = await ChatModel.find({
    participants: { $in: [userObjectId] },
  })
    .populate("participants", "name avatar isOnline lastSeen")
    .populate({
      path: "lastMessage",
      populate: {
        path: "sender",
        select: "name avatar",
      },
    })
    .sort({ lastMessageAt: -1 })
    .lean();

  return chats;
};

export const getSingleChatService = async (chatId: string, userId: string) => {
  const chatObjectId = new mongoose.Types.ObjectId(chatId);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Ensure user is part of chat
  const chat = await ChatModel.findOne({
    _id: chatObjectId,
    participants: { $in: [userObjectId] },
  }).populate("participants", "name avatar isOnline lastSeen");

  if (!chat) {
    throw new NotFoundException("Chat not found or you are not authorized");
  }

  // Fetch messages (latest first)
  const messages = await MessageModel.find({
    chatId: chatObjectId,
    isDeleted: false,
  })
    .populate("sender", "name avatar")
    .populate({
      path: "replyTo",
      select: "content mediaUrl sender",
      populate: {
        path: "sender",
        select: "name avatar",
      },
    })
    .sort({ createdAt: -1 })
    .limit(50) // pagination base (important)
    .lean();

  return {
    chat,
    messages,
  };
};

export const validateChatParticipant = async (
  chatId: string,
  userId: string,
) => {
  const chat = await ChatModel.findOne({
    _id: chatId,
    participants: {
      $in: [userId],
    },
  });
  if (!chat) throw new BadRequestException("User not a participant in chat");
  return chat;
};
