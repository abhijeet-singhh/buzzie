import mongoose from "mongoose";
import ChatModel from "../models/chat.model";
import UserModel from "../models/user.model";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "../utils/app-error";
import MessageModel from "../models/message.model";
import {
  emitChatRemoved,
  emitChatUpdated,
  emitNewChatToParticipants,
} from "../lib/socket";

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
    const directKey = participants.map((id) => id.toString()).join(":");

    // Check existing chat (index-friendly)
    const existingChat = await ChatModel.findOne({
      participants,
      isGroup: false,
    }).populate("participants", "name avatar isOnline");

    if (existingChat) {
      if (!existingChat.directKey) {
        existingChat.directKey = directKey;
        await existingChat.save();
      }
      return existingChat;
    }

    try {
      const chat = await ChatModel.create({
        participants,
        directKey,
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

      const populatedChat = await chat.populate("participants", "name avatar");
      const participantIdStrings = populatedChat.participants.map((p: any) =>
        p._id.toString(),
      );

      emitNewChatToParticipants(participantIdStrings, populatedChat);

      return chat;
    } catch (error: any) {
      // Handle race condition (duplicate key error)
      if (error.code === 11000) {
        return await ChatModel.findOne({
          directKey,
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

    let chat = await ChatModel.create({
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

    chat = await chat.populate("participants", "name avatar");
    const participantIdStrings = chat.participants.map((p: any) =>
      p._id.toString(),
    );

    emitNewChatToParticipants(participantIdStrings, chat);

    return chat;
  }

  throw new BadRequestException("Invalid chat creation payload");
};

export const getUserChatsService = async (
  userId: string,
  query: { page?: number; limit?: number } = {},
) => {
  const { page = 1, limit = 20 } = query;
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const filter = { participants: { $in: [userObjectId] } };
  const skip = (page - 1) * limit;

  const [chats, total] = await Promise.all([
    ChatModel.find(filter)
      .populate("participants", "name avatar isOnline lastSeen")
      .populate({
        path: "lastMessage",
        populate: {
          path: "sender",
          select: "name avatar",
        },
      })
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ChatModel.countDocuments(filter),
  ]);

  const unreadCounts = new Map<string, number>();

  if (chats.length > 0) {
    const unreadConditions = chats.map((chat: any) => {
      const ownRead = chat.lastReadBy?.find(
        (entry: any) => entry.user.toString() === userId,
      );
      return {
        chatId: chat._id,
        createdAt: { $gt: ownRead?.lastReadAt ?? new Date(0) },
      };
    });

    const unread = await MessageModel.aggregate<{
      _id: mongoose.Types.ObjectId;
      count: number;
    }>([
      {
        $match: {
          $or: unreadConditions,
          isDeleted: false,
          messageType: { $ne: "system" },
          sender: { $ne: userObjectId },
        },
      },
      { $group: { _id: "$chatId", count: { $sum: 1 } } },
    ]);

    for (const row of unread) {
      unreadCounts.set(row._id.toString(), row.count);
    }
  }

  const chatsWithUnread = chats.map((chat: any) => ({
    ...chat,
    unreadCount: unreadCounts.get(chat._id.toString()) ?? 0,
  }));

  return {
    chats: chatsWithUnread,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
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
    .select("-isRead")
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
  const chatObjectId = new mongoose.Types.ObjectId(chatId);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const chat = await ChatModel.findOne({
    _id: chatObjectId,
    participants: {
      $in: [userObjectId],
    },
  });
  if (!chat) throw new BadRequestException("User not a participant in chat");
  return chat;
};

async function assertGroupAdmin(
  chat: any,
  userId: string,
): Promise<void> {
  if (!chat.isGroup) throw new BadRequestException("Not a group chat");

  const isParticipant = chat.participants?.some(
    (p: any) => p.toString() === userId,
  );
  if (!isParticipant) {
    throw new ForbiddenException("You are not a participant in this chat");
  }

  const isAdmin = chat.admins?.some((a: any) => a.toString() === userId);
  const isCreator = chat.createdBy.toString() === userId;
  if (!isAdmin && !isCreator) {
    throw new ForbiddenException("Only admins can perform this action");
  }
}

export const addMemberToGroupService = async (
  chatId: string,
  userId: string,
  targetUserId: string,
) => {
  const chatObjectId = new mongoose.Types.ObjectId(chatId);
  const targetObjectId = new mongoose.Types.ObjectId(targetUserId);

  const chat = await ChatModel.findById(chatObjectId);
  if (!chat) throw new NotFoundException("Chat not found");
  await assertGroupAdmin(chat, userId);

  const targetUser = await UserModel.findById(targetObjectId)
    .select("_id")
    .lean();
  if (!targetUser) {
    throw new NotFoundException("User not found");
  }

  const isAlreadyMember = chat.participants.some(
    (p) => p.toString() === targetUserId,
  );
  if (isAlreadyMember) {
    throw new BadRequestException("User is already a member");
  }

  chat.participants.push(targetObjectId);
  chat.lastReadBy.push({ user: targetObjectId, lastReadAt: new Date() });
  await chat.save();

  const updatedChat = await ChatModel.findById(chatObjectId)
    .populate("participants", "name avatar isOnline lastSeen")
    .populate("lastMessage")
    .lean();

  if (!updatedChat) throw new NotFoundException("Chat not found after update");
  emitChatUpdated(updatedChat);

  return updatedChat;
};

export const removeMemberFromGroupService = async (
  chatId: string,
  userId: string,
  targetUserId: string,
) => {
  const chatObjectId = new mongoose.Types.ObjectId(chatId);

  const chat = await ChatModel.findById(chatObjectId);
  if (!chat) throw new NotFoundException("Chat not found");
  await assertGroupAdmin(chat, userId);

  if (targetUserId === userId) {
    throw new BadRequestException("Use leave endpoint to remove yourself");
  }

  const isMember = chat.participants.some(
    (p) => p.toString() === targetUserId,
  );
  if (!isMember) {
    throw new NotFoundException("User is not a member of this chat");
  }

  const wasCreator = chat.createdBy.toString() === targetUserId;

  chat.participants = chat.participants.filter(
    (p) => p.toString() !== targetUserId,
  );

  if (chat.participants.length < 2) {
    throw new BadRequestException(
      "A group must have at least 2 remaining members",
    );
  }

  chat.admins = (chat.admins || []).filter(
    (a) => a.toString() !== targetUserId,
  );
  chat.lastReadBy = chat.lastReadBy.filter(
    (lrb) => lrb.user.toString() !== targetUserId,
  );

  if (chat.admins.length === 0) {
    chat.admins = [chat.participants[0]];
  }

  if (wasCreator) {
    chat.createdBy = chat.admins[0] ?? chat.participants[0];
  }

  await chat.save();

  const updatedChat = await ChatModel.findById(chatObjectId)
    .populate("participants", "name avatar isOnline lastSeen")
    .populate("lastMessage")
    .lean();

  if (!updatedChat) throw new NotFoundException("Chat not found after update");
  emitChatUpdated(updatedChat);
  emitChatRemoved(targetUserId, chatId);

  return updatedChat;
};

export const updateGroupNameService = async (
  chatId: string,
  userId: string,
  groupName: string,
) => {
  const chatObjectId = new mongoose.Types.ObjectId(chatId);

  const chat = await ChatModel.findById(chatObjectId);
  if (!chat) throw new NotFoundException("Chat not found");
  await assertGroupAdmin(chat, userId);

  chat.groupName = groupName;
  await chat.save();

  const updatedChat = await ChatModel.findById(chatObjectId)
    .populate("participants", "name avatar isOnline lastSeen")
    .populate("lastMessage")
    .lean();

  if (!updatedChat) throw new NotFoundException("Chat not found after update");
  emitChatUpdated(updatedChat);

  return updatedChat;
};

export const updateGroupAvatarService = async (
  chatId: string,
  userId: string,
  groupAvatar: string,
) => {
  const chatObjectId = new mongoose.Types.ObjectId(chatId);

  const chat = await ChatModel.findById(chatObjectId);
  if (!chat) throw new NotFoundException("Chat not found");
  await assertGroupAdmin(chat, userId);

  chat.groupAvatar = groupAvatar;
  await chat.save();

  const updatedChat = await ChatModel.findById(chatObjectId)
    .populate("participants", "name avatar isOnline lastSeen")
    .populate("lastMessage")
    .lean();

  if (!updatedChat) throw new NotFoundException("Chat not found after update");
  emitChatUpdated(updatedChat);

  return updatedChat;
};

export const leaveGroupChatService = async (
  chatId: string,
  userId: string,
) => {
  const chatObjectId = new mongoose.Types.ObjectId(chatId);

  const chat = await ChatModel.findById(chatObjectId);
  if (!chat) throw new NotFoundException("Chat not found");

  if (!chat.isGroup) {
    throw new BadRequestException("Only group chats can be left");
  }

  const isParticipant = chat.participants.some(
    (participant) => participant.toString() === userId,
  );
  if (!isParticipant) {
    throw new ForbiddenException("You are not a participant in this chat");
  }

  const remainingParticipants = chat.participants.filter(
    (participant) => participant.toString() !== userId,
  );
  if (remainingParticipants.length < 2) {
    throw new BadRequestException(
      "A group must have at least 2 remaining members",
    );
  }

  chat.participants = remainingParticipants;
  chat.admins = (chat.admins || []).filter(
    (admin) => admin.toString() !== userId,
  );
  chat.lastReadBy = chat.lastReadBy.filter(
    (entry) => entry.user.toString() !== userId,
  );

  if (chat.admins.length === 0) {
    chat.admins = [remainingParticipants[0]];
  }

  if (chat.createdBy.toString() === userId) {
    chat.createdBy = chat.admins[0] ?? remainingParticipants[0];
  }

  await chat.save();

  const updatedChat = await ChatModel.findById(chatObjectId)
    .populate("participants", "name avatar isOnline lastSeen")
    .populate("lastMessage")
    .lean();

  if (!updatedChat) throw new NotFoundException("Chat not found after update");

  emitChatUpdated(updatedChat);
  emitChatRemoved(userId, chatId);

  return updatedChat;
};
