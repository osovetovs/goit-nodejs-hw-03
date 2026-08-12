import { Router } from "express";
import { z } from "zod";

import {
  getMe,
  loginUser,
  logoutUser,
  refreshTokens,
  registerUser,
} from "../controllers/auth.controller.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { authRateLimiter } from "../middleware/authRateLimiter.ts";
import { validateBody } from "../middleware/validate.ts";
import {
  errorSchema,
  profileUserSchema,
  publicUserSchema,
  registry,
  tokenPairSchema,
} from "../openapi.ts";
import {
  loginSchema,
  refreshSchema,
  registerSchema,
} from "../validators/auth.validator.ts";

const router = Router();

router.use(authRateLimiter);

router.post("/register", validateBody(registerSchema), registerUser);
router.post("/login", validateBody(loginSchema), loginUser);
router.post("/refresh", validateBody(refreshSchema), refreshTokens);
router.post("/logout", authenticate, logoutUser);
router.get("/me", authenticate, getMe);

const rateLimitResponse = {
  description: "Too many requests",
  content: { "application/json": { schema: errorSchema } },
};

const authResponseSchema = z.object({
  user: publicUserSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
});

registry.registerPath({
  method: "post",
  path: "/auth/register",
  tags: ["Auth"],
  summary: "Register a new user",
  request: {
    body: {
      content: { "application/json": { schema: registerSchema } },
    },
  },
  responses: {
    201: {
      description: "User created",
      content: { "application/json": { schema: authResponseSchema } },
    },
    400: {
      description: "Validation failed",
      content: { "application/json": { schema: errorSchema } },
    },
    409: {
      description: "Username or email already taken",
      content: { "application/json": { schema: errorSchema } },
    },
    429: rateLimitResponse,
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/login",
  tags: ["Auth"],
  summary: "Log in",
  request: {
    body: {
      content: { "application/json": { schema: loginSchema } },
    },
  },
  responses: {
    200: {
      description: "Authenticated",
      content: { "application/json": { schema: authResponseSchema } },
    },
    401: {
      description: "Invalid credentials",
      content: { "application/json": { schema: errorSchema } },
    },
    429: rateLimitResponse,
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/refresh",
  tags: ["Auth"],
  summary: "Rotate refresh token and issue a new token pair",
  request: {
    body: {
      content: { "application/json": { schema: refreshSchema } },
    },
  },
  responses: {
    200: {
      description: "New token pair",
      content: { "application/json": { schema: tokenPairSchema } },
    },
    401: {
      description: "Invalid or expired refresh token",
      content: { "application/json": { schema: errorSchema } },
    },
    429: rateLimitResponse,
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/logout",
  tags: ["Auth"],
  summary: "Log out",
  security: [{ bearerAuth: [] }],
  responses: {
    204: { description: "Logged out" },
    401: {
      description: "Unauthorized",
      content: { "application/json": { schema: errorSchema } },
    },
    429: rateLimitResponse,
  },
});

registry.registerPath({
  method: "get",
  path: "/auth/me",
  tags: ["Auth"],
  summary: "Get current user profile",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Current user",
      content: { "application/json": { schema: profileUserSchema } },
    },
    401: {
      description: "Unauthorized",
      content: { "application/json": { schema: errorSchema } },
    },
    429: rateLimitResponse,
  },
});

export default router;