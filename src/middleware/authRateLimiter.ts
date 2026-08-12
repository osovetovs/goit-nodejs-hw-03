import { rateLimit } from "express-rate-limit";

export type AuthRateLimiterOptions = {
  skipInTest?: boolean;
};

export function createAuthRateLimiter(
  options: AuthRateLimiterOptions = {},
) {
  const { skipInTest = true } = options;

  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    statusCode: 429,
    message: {
      error:
        "Too many requests, please try again later",
    },
    skip: () =>
      skipInTest &&
      process.env.NODE_ENV === "test",
  });
}

export const authRateLimiter =
  createAuthRateLimiter();