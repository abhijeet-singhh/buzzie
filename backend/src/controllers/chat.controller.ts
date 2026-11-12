import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { HTTPSTATUS } from "../config/http.config";
import {
  chatIdSchema,
  createChatSchema,
  getChatsQuerySchema,
  memberActionBodySchema,
  updateGroupAvatarBodySchema,
  updateGroupNameBodySchema,
} from "../validators/chat.validator";
import {
  addMemberToGroupService,
  createChatService,
  getSingleChatService,
  getUserChatsService,
  leaveGroupChatService,
  removeMemberFromGroupService,
  updateGroupAvatarService,
  updateGroupNameService,
} from "../services/chat.service";
import { UnauthorizedException } from "../utils/app-error";
import { validate } from "../utils/validate";

export const createChatController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;

    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }

    const userIdStr = userId.toString();

    const body = validate(createChatSchema, req.body);

    const chat = await createChatService(userIdStr, body);

    return res.status(HTTPSTATUS.CREATED).json({
      message: "Chat created successfully",
      chat,
    });
  },
);

export const getUserChatsController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;

    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }

    const userIdStr = userId.toString();
    const query = validate(getChatsQuerySchema, req.query);

    const { chats, pagination } = await getUserChatsService(userIdStr, query);

    return res.status(HTTPSTATUS.OK).json({
      message: "Chats retrieved successfully",
      chats,
      pagination,
    });
  },
);

export const getSingleChatController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;

    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }

    const userIdStr = userId.toString();

    const { id } = validate(chatIdSchema, req.params);

    const { chat, messages } = await getSingleChatService(id, userIdStr);

    return res.status(HTTPSTATUS.OK).json({
      message: "Chat retrieved successfully",
      chat,
      messages,
    });
  },
);

export const addMemberController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) throw new UnauthorizedException("User not authenticated");

    const { id } = validate(chatIdSchema, req.params);
    const { userId: targetUserId } = validate(memberActionBodySchema, req.body);

    const chat = await addMemberToGroupService(
      id,
      userId.toString(),
      targetUserId,
    );

    return res.status(HTTPSTATUS.OK).json({
      message: "Member added successfully",
      chat,
    });
  },
);

export const removeMemberController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) throw new UnauthorizedException("User not authenticated");

    const { id } = validate(chatIdSchema, req.params);
    const { userId: targetUserId } = validate(memberActionBodySchema, req.body);

    const chat = await removeMemberFromGroupService(
      id,
      userId.toString(),
      targetUserId,
    );

    return res.status(HTTPSTATUS.OK).json({
      message: "Member removed successfully",
      chat,
    });
  },
);

export const updateGroupNameController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) throw new UnauthorizedException("User not authenticated");

    const { id } = validate(chatIdSchema, req.params);
    const { groupName } = validate(updateGroupNameBodySchema, req.body);

    const chat = await updateGroupNameService(id, userId.toString(), groupName);

    return res.status(HTTPSTATUS.OK).json({
      message: "Group name updated successfully",
      chat,
    });
  },
);

export const updateGroupAvatarController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) throw new UnauthorizedException("User not authenticated");

    const { id } = validate(chatIdSchema, req.params);
    const { groupAvatar } = validate(updateGroupAvatarBodySchema, req.body);

    const chat = await updateGroupAvatarService(
      id,
      userId.toString(),
      groupAvatar,
    );

    return res.status(HTTPSTATUS.OK).json({
      message: "Group avatar updated successfully",
      chat,
    });
  },
);

export const leaveGroupChatController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) throw new UnauthorizedException("User not authenticated");

    const { id } = validate(chatIdSchema, req.params);

    await leaveGroupChatService(id, userId.toString());

    return res.status(HTTPSTATUS.OK).json({
      message: "You left the group chat",
    });
  },
);
