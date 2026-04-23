import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { loginSchema, registerSchema } from "../validators/auth.validator";
import { loginService, registerService } from "../services/auth.service";
import { clearJwtAuthCookie, setJwtAuthCookie } from "../utils/cookie";
import { HTTPSTATUS } from "../config/http.config";
import { BadRequestException, UnauthorizedException } from "../utils/app-error";

export const registerController = asyncHandler(
  async (req: Request, res: Response) => {
    const result = registerSchema.safeParse(req.body);

    if (!result.success) {
      const message = result.error.issues.map((err) => err.message).join(", ");
      throw new BadRequestException(message);
    }

    const user = await registerService(result.data);

    const safeUser = {
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
    };

    return setJwtAuthCookie({
      res,
      userId: user._id.toString(),
    })
      .status(HTTPSTATUS.CREATED)
      .json({
        message: "User created & logged in successfully",
        data: safeUser,
      });
  },
);

export const loginController = asyncHandler(
  async (req: Request, res: Response) => {
    const result = loginSchema.safeParse(req.body);

    if (!result.success) {
      const message = result.error.issues.map((err) => err.message).join(", ");
      throw new BadRequestException(message);
    }

    const user = await loginService(result.data);

    const safeUser = {
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
    };

    return setJwtAuthCookie({
      res,
      userId: user._id.toString(),
    })
      .status(HTTPSTATUS.OK)
      .json({
        message: "User logged in successfully",
        data: safeUser,
      });
  },
);

export const logoutController = asyncHandler(
  async (_req: Request, res: Response) => {
    return clearJwtAuthCookie(res).status(HTTPSTATUS.OK).json({
      message: "User logged out successfully",
    });
  },
);

export const authStatusController = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new UnauthorizedException("User not authenticated");
    }

    const safeUser = {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      avatar: req.user.avatar,
    };

    return res.status(HTTPSTATUS.OK).json({
      message: "Authenticated User",
      data: safeUser,
    });
  },
);
