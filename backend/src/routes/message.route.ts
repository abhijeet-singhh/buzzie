import { Router } from "express";
import { passportAuthenticateJwt } from "../config/passport.config";
import {
  deleteMessageController,
  editMessageController,
  getMessagesController,
  getPinnedMessagesController,
  markAsReadController,
  pinMessageController,
  searchMessagesController,
  sendMessageController,
} from "../controllers/message.controller";
import { sendMessageRateLimiter } from "../middlewares/rateLimit.middleware";

const messageRoutes = Router();

messageRoutes.use(passportAuthenticateJwt);

messageRoutes.post("/", sendMessageRateLimiter, sendMessageController);

messageRoutes.get("/", getMessagesController);
messageRoutes.get("/search", searchMessagesController);
messageRoutes.get("/pinned", getPinnedMessagesController);

messageRoutes.patch("/:chatId/read", markAsReadController);
messageRoutes.patch("/:chatId/:messageId/pin", pinMessageController);
messageRoutes.patch("/:chatId/:messageId", editMessageController);

messageRoutes.delete("/:chatId/:messageId", deleteMessageController);

export default messageRoutes;
