import bcrypt from "bcrypt";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import {
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { authenticate } from "../src/middleware/authenticate.ts";
import { registerSchema } from "../src/validators/auth.validator.ts";

const TEST_JWT_SECRET = "vitest-test-secret-that-is-long-enough";

function createRequest(authorization?: string) {
  return {
    header: vi.fn((name: string) => {
      if (name.toLowerCase() === "authorization") {
        return authorization;
      }

      return undefined;
    }),
  } as unknown as Request;
}

function createResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };

  response.status.mockReturnValue(response);

  return response as unknown as Response;
}

describe("Authentication", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = TEST_JWT_SECRET;
  });

  it("accepts valid registration data", () => {
    const result = registerSchema.safeParse({
      username: "testuser",
      email: "testuser@example.com",
      password: "password123",
      name: "Test User",
    });

    expect(result.success).toBe(true);
  });

  it("hashes a password and verifies it correctly", async () => {
    const password = "password123";
    const hash = await bcrypt.hash(password, 4);

    expect(hash).not.toBe(password);
    expect(await bcrypt.compare(password, hash)).toBe(true);
    expect(await bcrypt.compare("wrong-password", hash)).toBe(false);
  });

  it("accepts a valid access token", () => {
    const accessToken = jwt.sign(
      {
        username: "testuser",
        type: "access",
      },
      TEST_JWT_SECRET,
      {
        subject: "42",
        expiresIn: "15m",
      },
    );

    const req = createRequest(`Bearer ${accessToken}`);
    const res = createResponse();
    const next = vi.fn() as unknown as NextFunction;

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();

    expect(req.user).toMatchObject({
      sub: "42",
      username: "testuser",
      type: "access",
    });
  });

  it("rejects a refresh token when used as an access token", () => {
    const refreshToken = jwt.sign(
      {
        username: "testuser",
        type: "refresh",
      },
      TEST_JWT_SECRET,
      {
        subject: "42",
        expiresIn: "7d",
      },
    );

    const req = createRequest(`Bearer ${refreshToken}`);
    const res = createResponse();
    const next = vi.fn() as unknown as NextFunction;

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Unauthorized",
    });
  });

  it("rejects a request without an authorization header", () => {
    const req = createRequest();
    const res = createResponse();
    const next = vi.fn() as unknown as NextFunction;

    authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: "Unauthorized",
    });
  });
});