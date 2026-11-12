import { Router } from "express";
import {
  authStatusController,
  loginController,
  logoutController,
  registerController,
} from "../controllers/auth.controller";
import { passportAuthenticateJwt } from "../config/passport.config";
import { authRateLimiter } from "../middlewares/rateLimit.middleware";

const authRoutes = Router()
  .post("/register", authRateLimiter, registerController)
  .post("/login", authRateLimiter, loginController)
  .post("/logout", passportAuthenticateJwt, logoutController)
  .get("/status", passportAuthenticateJwt, authStatusController);

export default authRoutes;
