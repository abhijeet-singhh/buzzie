import UserModel from "../models/user.model";
import { NotFoundException } from "../utils/app-error";

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
    _id: { $ne: currentUserId },
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
