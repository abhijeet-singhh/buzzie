import { Router } from "express";
import { passportAuthenticateJwt } from "../config/passport.config";
import {
  addMemberController,
  createChatController,
  getSingleChatController,
  getUserChatsController,
  leaveGroupChatController,
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
chatRoutes.delete("/:id/members/me", leaveGroupChatController);
chatRoutes.patch("/:id/group-name", updateGroupNameController);
chatRoutes.patch("/:id/group-avatar", updateGroupAvatarController);

export default chatRoutes;
