import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import createHttpError from "http-errors";
import jwt from "jsonwebtoken";

import prisma from "../../prisma/client.ts";
import type {
  LoginInput,
  RefreshInput,
  RegisterInput,
} from "../validators/auth.validator.ts";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";

const publicUserSelect = {
  id: true,
  username: true,
  email: true,
  name: true,
} as const;

const profileUserSelect = {
  ...publicUserSelect,
  createdAt: true,
} as const;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return secret;
}

function createTokenPair(user: { id: number; username: string }) {
  const secret = getJwtSecret();

  const accessToken = jwt.sign(
    { username: user.username, type: "access" },
    secret,
    {
      subject: String(user.id),
      expiresIn: ACCESS_TOKEN_TTL,
      jwtid: randomUUID(),
    },
  );

  const refreshToken = jwt.sign(
    { username: user.username, type: "refresh" },
    secret,
    {
      subject: String(user.id),
      expiresIn: REFRESH_TOKEN_TTL,
      jwtid: randomUUID(),
    },
  );

  return { accessToken, refreshToken };
}

export async function registerUser(req: Request, res: Response) {
  const input = req.validatedBody as RegisterInput;

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ username: input.username }, { email: input.email }],
    },
    select: { id: true },
  });

  if (existingUser) {
    throw createHttpError(409, "Username or email already taken");
  }

  const password = await bcrypt.hash(input.password, 10);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: input.username,
        email: input.email,
        password,
        name: input.name,
      },
      select: publicUserSelect,
    });

    const tokens = createTokenPair(user);

    await tx.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: user.id,
      },
    });

    return { user, ...tokens };
  });

  res.status(201).json(result);
}

export async function loginUser(req: Request, res: Response) {
  const input = req.validatedBody as LoginInput;

  const user = await prisma.user.findUnique({
    where: { username: input.username },
  });

  const passwordMatches = user
    ? await bcrypt.compare(input.password, user.password)
    : false;

  if (!user || !passwordMatches) {
    throw createHttpError(401, "Invalid credentials");
  }

  const tokens = createTokenPair(user);

  await prisma.$transaction([
    prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
    prisma.refreshToken.create({
      data: { token: tokens.refreshToken, userId: user.id },
    }),
  ]);

  const { password: _password, ...publicUser } = user;

  res.status(200).json({
    user: {
      id: publicUser.id,
      username: publicUser.username,
      email: publicUser.email,
      name: publicUser.name,
    },
    ...tokens,
  });
}

export async function refreshTokens(req: Request, res: Response) {
  const { refreshToken } = req.validatedBody as RefreshInput;

  let decoded: jwt.JwtPayload;

  try {
    const verified = jwt.verify(refreshToken, getJwtSecret());

    if (
      typeof verified === "string" ||
      verified.type !== "refresh" ||
      typeof verified.sub !== "string"
    ) {
      throw new Error("Invalid refresh token");
    }

    decoded = verified;
  } catch {
    throw createHttpError(401, "Invalid or expired refresh token");
  }

  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: {
      user: {
        select: { id: true, username: true },
      },
    },
  });

  if (!storedToken || String(storedToken.userId) !== decoded.sub) {
    throw createHttpError(401, "Invalid or expired refresh token");
  }

  const tokens = createTokenPair(storedToken.user);

  await prisma.$transaction(async (tx) => {
    const deleted = await tx.refreshToken.deleteMany({
      where: { token: refreshToken },
    });

    if (deleted.count !== 1) {
      throw createHttpError(401, "Invalid or expired refresh token");
    }

    await tx.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId: storedToken.userId,
      },
    });
  });

  res.status(200).json(tokens);
}

export async function logoutUser(req: Request, res: Response) {
  const userId = Number(req.user?.sub);

  await prisma.refreshToken.deleteMany({ where: { userId } });

  res.status(204).end();
}

export async function getMe(req: Request, res: Response) {
  const userId = Number(req.user?.sub);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: profileUserSelect,
  });

  if (!user) {
    throw createHttpError(401, "Unauthorized");
  }

  res.status(200).json(user);
}
