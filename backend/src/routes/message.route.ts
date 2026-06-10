import { Router } from "express";
import { passportAuthenticateJwt } from "../config/passport.config";
import {
  deleteMessageController,
  getMessagesController,
  markAsReadController,
  sendMessageController,
} from "../controllers/message.controller";

const messageRoutes = Router();

messageRoutes.use(passportAuthenticateJwt);

messageRoutes.post("/", sendMessageController);

messageRoutes.get("/", getMessagesController);

messageRoutes.patch("/:chatId/read", markAsReadController);

messageRoutes.delete("/:chatId/:messageId", deleteMessageController);

export default messageRoutes;
