import UserModel from "../models/user.model";
import { BadRequestException, UnauthorizedException } from "../utils/app-error";
import {
  RegisterSchemaType,
  LoginSchemaType,
} from "../validators/auth.validator";

export const registerService = async (body: RegisterSchemaType) => {
  try {
    const newUser = await UserModel.create(body);
    return newUser;
  } catch (error: any) {
    if (error.code === 11000) {
      throw new BadRequestException("User already exists");
    }
    throw error;
  }
};

export const loginService = async (body: LoginSchemaType) => {
  const { email, password } = body;

  const user = await UserModel.findOne({ email }).select("+password");

  if (!user) {
    throw new UnauthorizedException("Invalid email or password");
  }

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    throw new UnauthorizedException("Invalid email or password");
  }

  return user;
};
