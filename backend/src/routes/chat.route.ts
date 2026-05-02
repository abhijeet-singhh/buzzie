import { Router } from "express";
import { passportAuthenticateJwt } from "../config/passport.config";
import {
  createChatController,
  getSingleChatController,
  getUserChatsController,
} from "../controllers/chat.controller";

const chatRoutes = Router();

chatRoutes.use(passportAuthenticateJwt);

chatRoutes.post("/", createChatController);
chatRoutes.get("/", getUserChatsController);
chatRoutes.get("/:id", getSingleChatController);

export default chatRoutes;
