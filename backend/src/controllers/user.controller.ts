import { Request, Response } from "express";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { HTTPSTATUS } from "../config/http.config";
import { getUsersService } from "../services/user.service";
import { getUsersQuerySchema } from "../validators/user.validator";
import { UnauthorizedException } from "../utils/app-error";

export const getUsersController = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;

    if (!userId) {
      throw new UnauthorizedException("User not authenticated");
    }

    const userIdStr = userId.toString();

    // Validate query
    const query = getUsersQuerySchema.parse(req.query);

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
