import { Router } from "express";
import { passportAuthenticateJwt } from "../config/passport.config";
import {
  getUsersController,
  getUsersPresenceController,
  updateProfileController,
} from "../controllers/user.controller";

const userRoutes = Router();

userRoutes.use(passportAuthenticateJwt);

userRoutes.get("/", getUsersController);
userRoutes.get("/presence", getUsersPresenceController);
userRoutes.patch("/me", updateProfileController);

export default userRoutes;
