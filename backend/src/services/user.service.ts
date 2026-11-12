import mongoose from "mongoose";
import UserModel from "../models/user.model";
import { NotFoundException } from "../utils/app-error";
import { getUserOnlineStatuses } from "../lib/presence";

type GetUsersParams = {
  currentUserId: string;
  search?: string;
  page?: number;
  limit?: number;
};

export const findByIdUserService = async (userId: string) => {
  const user = await UserModel.findById(userId)
    .select("name email avatar isOnline lastSeen createdAt")
    .lean();

  if (!user) {
    throw new NotFoundException("User not found");
  }

  return user;
};

export const getUsersService = async ({
  currentUserId,
  search,
  page = 1,
  limit = 20,
}: GetUsersParams) => {
  const query: any = {
    _id: { $ne: new mongoose.Types.ObjectId(currentUserId) },
  };

  // Search support (for chat user selection)
  if (search) {
    query.name = { $regex: search, $options: "i" };
  }

  const skip = (page - 1) * limit;

  const users = await UserModel.find(query)
    .select("name avatar isOnline lastSeen")
    .sort({ isOnline: -1, lastSeen: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await UserModel.countDocuments(query);

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const updateUserProfileService = async (
  userId: string,
  body: { name?: string; avatar?: string | null },
) => {
  const update: { name?: string; avatar?: string | null } = {};

  if (body.name !== undefined) update.name = body.name;
  if (body.avatar !== undefined) update.avatar = body.avatar;

  const user = await UserModel.findByIdAndUpdate(userId, update, {
    returnDocument: "after",
    runValidators: true,
  })
    .select("name email avatar isOnline lastSeen createdAt")
    .lean();

  if (!user) throw new NotFoundException("User not found");

  return user;
};

export const getUsersPresenceService = async (userIds: string[]) => {
  const userObjectIds = userIds.map((id) => new mongoose.Types.ObjectId(id));
  const [users, onlineStatuses] = await Promise.all([
    UserModel.find({ _id: { $in: userObjectIds } })
      .select("_id isOnline lastSeen")
      .lean(),
    getUserOnlineStatuses(userIds),
  ]);

  return {
    presences: users.map((user) => {
      const userId = user._id.toString();
      return {
        userId,
        isOnline: onlineStatuses.get(userId) ?? user.isOnline,
        lastSeen: user.lastSeen,
      };
    }),
  };
};
