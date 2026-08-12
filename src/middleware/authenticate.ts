import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return secret;
};

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authorization = req.header("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());

    if (
      typeof decoded === "string" ||
      decoded.type !== "access" ||
      typeof decoded.sub !== "string" ||
      typeof decoded.username !== "string"
    ) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = {
      ...decoded,
      sub: decoded.sub,
      username: decoded.username,
      type: "access",
    };

    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
};
