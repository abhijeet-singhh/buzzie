import { Router } from "express";
import { passportAuthenticateJwt } from "../config/passport.config";
import { getUsersController } from "../controllers/user.controller";

const userRoutes = Router();

userRoutes.use(passportAuthenticateJwt);

userRoutes.get("/", getUsersController);

export default userRoutes;
