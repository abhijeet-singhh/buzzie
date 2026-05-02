import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { HTTPSTATUS } from "../config/http.config";
import { chatIdSchema, createChatSchema } from "../validators/chat.validator";
import {
  createChatService,
  getSingleChatService,
  getUserChatsService,
} from "../services/chat.service";
import { UnauthorizedException } from "../utils/app-error";

export const createChatController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;

    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }

    // convert ObjectId → string
    const userIdStr = userId.toString();

    // validate request body
    const body = createChatSchema.parse(req.body);

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

    const chats = await getUserChatsService(userIdStr);

    return res.status(HTTPSTATUS.OK).json({
      message: "Chats retrieved successfully",
      chats,
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

    // validate params
    const { id } = chatIdSchema.parse(req.params);

    const { chat, messages } = await getSingleChatService(id, userIdStr);

    return res.status(HTTPSTATUS.OK).json({
      message: "Chat retrieved successfully",
      chat,
      messages,
    });
  },
);
