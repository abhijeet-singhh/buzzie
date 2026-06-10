import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import {
  deleteMessageSchema,
  markAsReadSchema,
  sendMessageSchema,
} from "../validators/message.validator";
import { HTTPSTATUS } from "../config/http.config";
import {
  deleteMessageService,
  markAsReadService,
  sendMessageService,
} from "../services/message.service";
import { UnauthorizedException } from "../utils/app-error";
import { getMessagesQuerySchema } from "../validators/message.validator";
import { getMessagesService } from "../services/message.service";

export const sendMessageController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;

    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }

    // Convert ObjectId → string
    const userIdStr = userId.toString();

    // Validate body
    const body = sendMessageSchema.parse(req.body);

    const result = await sendMessageService(userIdStr, body);

    return res.status(HTTPSTATUS.CREATED).json({
      message: "Message sent successfully",
      messageData: result.message,
      chat: result.chat,
    });
  },
);

export const getMessagesController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;

    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }

    const userIdStr = userId.toString();

    const query = getMessagesQuerySchema.parse(req.query);

    const result = await getMessagesService(userIdStr, query);

    return res.status(HTTPSTATUS.OK).json({
      message: "Messages retrieved successfully",
      ...result,
    });
  },
);

export const markAsReadController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;

    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }

    const { chatId } = markAsReadSchema.parse(req.params);

    await markAsReadService(userId.toString(), chatId);

    return res.status(HTTPSTATUS.OK).json({
      message: "Messages marked as read",
    });
  },
);

export const deleteMessageController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;

    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }

    const { chatId, messageId } = deleteMessageSchema.parse(req.params);

    await deleteMessageService(userId.toString(), chatId, messageId);

    return res.status(HTTPSTATUS.OK).json({
      message: "Message deleted successfully",
    });
  },
);
