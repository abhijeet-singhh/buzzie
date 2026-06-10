import { Router } from "express";
import { passportAuthenticateJwt } from "../config/passport.config";
import {
  addMemberController,
  createChatController,
  getSingleChatController,
  getUserChatsController,
  removeMemberController,
  updateGroupAvatarController,
  updateGroupNameController,
} from "../controllers/chat.controller";

const chatRoutes = Router();

chatRoutes.use(passportAuthenticateJwt);

chatRoutes.post("/", createChatController);
chatRoutes.get("/", getUserChatsController);
chatRoutes.get("/:id", getSingleChatController);

chatRoutes.patch("/:id/members/add", addMemberController);
chatRoutes.patch("/:id/members/remove", removeMemberController);
chatRoutes.patch("/:id/group-name", updateGroupNameController);
chatRoutes.patch("/:id/group-avatar", updateGroupAvatarController);

export default chatRoutes;
