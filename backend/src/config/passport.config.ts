import passport from "passport";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import { Env } from "./env.config";
import { findByIdUserService } from "../services/user.service";

type JwtPayload = {
  userId: string;
};

const COOKIE_NAME = "accessToken";

passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req) => req?.cookies?.[COOKIE_NAME] || null,
      ]),
      secretOrKey: Env.JWT_SECRET,
      audience: ["user"],
      issuer: "Buzzie",
      algorithms: ["HS256"],
      ignoreExpiration: false,
    },
    async (payload: JwtPayload, done) => {
      try {
        const user = await findByIdUserService(payload.userId);

        if (!user) {
          return done(null, false);
        }

        return done(null, user);
      } catch (error) {
        return done(error, false);
      }
    },
  ),
);

export const passportAuthenticateJwt = passport.authenticate("jwt", {
  session: false,
});
