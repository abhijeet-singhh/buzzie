import { Router } from "express";
import {
  authStatusController,
  loginController,
  logoutController,
  registerController,
} from "../controllers/auth.controller";
import { passportAuthenticateJwt } from "../config/passport.config";

const authRoutes = Router()
  .post("/register", registerController)
  .post("/login", loginController)
  .post("/logout", passportAuthenticateJwt, logoutController)
  .get("/status", passportAuthenticateJwt, authStatusController);

export default authRoutes;
