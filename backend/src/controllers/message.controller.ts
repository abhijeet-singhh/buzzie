import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import {
  deleteMessageSchema,
  editMessageBodySchema,
  editMessageSchema,
  getMessagesQuerySchema,
  getPinnedMessagesQuerySchema,
  markAsReadSchema,
  pinMessageBodySchema,
  pinMessageSchema,
  searchMessagesQuerySchema,
  sendMessageSchema,
} from "../validators/message.validator";
import { HTTPSTATUS } from "../config/http.config";
import {
  deleteMessageService,
  editMessageService,
  getMessagesService,
  getPinnedMessagesService,
  markAsReadService,
  pinMessageService,
  searchMessagesService,
  sendMessageService,
} from "../services/message.service";
import { UnauthorizedException } from "../utils/app-error";
import { validate } from "../utils/validate";

export const sendMessageController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;

    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }

    // Convert ObjectId → string
    const userIdStr = userId.toString();

    // Validate body
    const body = validate(sendMessageSchema, req.body);

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

    const query = validate(getMessagesQuerySchema, req.query);

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

    const { chatId } = validate(markAsReadSchema, req.params);

    const result = await markAsReadService(userId.toString(), chatId);

    return res.status(HTTPSTATUS.OK).json({
      message: "Messages marked as read",
      lastReadAt: result.lastReadAt,
    });
  },
);

export const deleteMessageController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;

    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }

    const { chatId, messageId } = validate(deleteMessageSchema, req.params);

    await deleteMessageService(userId.toString(), chatId, messageId);

    return res.status(HTTPSTATUS.OK).json({
      message: "Message deleted successfully",
    });
  },
);

export const editMessageController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) throw new UnauthorizedException("User not authenticated");

    const { chatId, messageId } = validate(editMessageSchema, req.params);
    const { content } = validate(editMessageBodySchema, req.body);

    const message = await editMessageService(
      userId.toString(),
      chatId,
      messageId,
      content,
    );

    return res.status(HTTPSTATUS.OK).json({
      message: "Message updated successfully",
      messageData: message,
    });
  },
);

export const pinMessageController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) throw new UnauthorizedException("User not authenticated");

    const { chatId, messageId } = validate(pinMessageSchema, req.params);
    const { pinned } = validate(pinMessageBodySchema, req.body);

    const message = await pinMessageService(
      userId.toString(),
      chatId,
      messageId,
      pinned,
    );

    return res.status(HTTPSTATUS.OK).json({
      message: pinned ? "Message pinned successfully" : "Message unpinned successfully",
      messageData: message,
    });
  },
);

export const getPinnedMessagesController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) throw new UnauthorizedException("User not authenticated");

    const query = validate(getPinnedMessagesQuerySchema, req.query);
    const result = await getPinnedMessagesService(userId.toString(), query);

    return res.status(HTTPSTATUS.OK).json({
      message: "Pinned messages retrieved successfully",
      ...result,
    });
  },
);

export const searchMessagesController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) throw new UnauthorizedException("User not authenticated");

    const query = validate(searchMessagesQuerySchema, req.query);
    const result = await searchMessagesService(userId.toString(), query);

    return res.status(HTTPSTATUS.OK).json({
      message: "Messages searched successfully",
      ...result,
    });
  },
);
