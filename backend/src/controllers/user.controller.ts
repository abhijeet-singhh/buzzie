import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { HTTPSTATUS } from "../config/http.config";
import {
  getUsersPresenceService,
  getUsersService,
  updateUserProfileService,
} from "../services/user.service";
import {
  getUsersQuerySchema,
  presenceQuerySchema,
  updateProfileSchema,
} from "../validators/user.validator";
import { UnauthorizedException } from "../utils/app-error";
import { validate } from "../utils/validate";

export const getUsersController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;

    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }

    const userIdStr = userId.toString();

    // Validate query
    const query = validate(getUsersQuerySchema, req.query);

    const result = await getUsersService({
      currentUserId: userIdStr,
      search: query.search,
      page: query.page,
      limit: query.limit,
    });

    return res.status(HTTPSTATUS.OK).json({
      message: "Users retrieved successfully",
      ...result,
    });
  },
);

export const updateProfileController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) throw new UnauthorizedException("User not authenticated");

    const body = validate(updateProfileSchema, req.body);
    const user = await updateUserProfileService(userId.toString(), body);

    return res.status(HTTPSTATUS.OK).json({
      message: "Profile updated successfully",
      data: user,
    });
  },
);

export const getUsersPresenceController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;
    if (!userId) throw new UnauthorizedException("User not authenticated");

    const { ids } = validate(presenceQuerySchema, req.query);
    const result = await getUsersPresenceService(ids);

    return res.status(HTTPSTATUS.OK).json({
      message: "Presence retrieved successfully",
      ...result,
    });
  },
);
