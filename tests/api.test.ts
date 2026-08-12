import { once } from "node:events";
import type { Server } from "node:http";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { prismaMock, uploadImageToCloudinaryMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    refreshToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    announcement: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  uploadImageToCloudinaryMock: vi.fn(),
}));

vi.mock("../prisma/client.ts", () => ({
  default: prismaMock,
}));

vi.mock("../src/services/cloudinary.ts", () => ({
  uploadImageToCloudinary: uploadImageToCloudinaryMock,
}));

import { createApp } from "../src/app.ts";
import { createAuthRateLimiter } from "../src/middleware/authRateLimiter.ts";

const TEST_JWT_SECRET = "test-jwt-secret-for-api-integration-tests";
const ALLOWED_ORIGIN = "http://localhost:5173";
const CLOUDINARY_URL =
  "https://res.cloudinary.com/test/image/upload/announcements/test.png";

const user = {
  id: 1,
  username: "owner",
  email: "owner@example.com",
  name: "Owner User",
};

const secondUser = {
  id: 2,
  username: "second",
  email: "second@example.com",
  name: "Second User",
};

function makeAnnouncement(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: "Valid title",
    description: "Valid announcement description",
    price: 100,
    category: "sale",
    imageUrl: null,
    createdAt: new Date("2026-08-12T00:00:00.000Z"),
    updatedAt: new Date("2026-08-12T00:00:00.000Z"),
    user,
    ...overrides,
  };
}

function makeAccessToken(
  userId = user.id,
  username = user.username,
  expiresIn: number | string = "15m",
) {
  return jwt.sign(
    {
      username,
      type: "access",
    },
    TEST_JWT_SECRET,
    {
      subject: String(userId),
      expiresIn: expiresIn as jwt.SignOptions["expiresIn"],
    },
  );
}

function makeRefreshToken(
  userId = user.id,
  username = user.username,
  expiresIn: number | string = "7d",
) {
  return jwt.sign(
    {
      username,
      type: "refresh",
    },
    TEST_JWT_SECRET,
    {
      subject: String(userId),
      expiresIn: expiresIn as jwt.SignOptions["expiresIn"],
    },
  );
}

async function startServer(app: ReturnType<typeof express>) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Could not determine test server port");
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function closeServer(server: Server) {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) {
        rejectClose(error);
        return;
      }

      resolveClose();
    });
  });
}

async function parseResponse(response: Response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function jsonRequest(
  baseUrl: string,
  path: string,
  method: string,
  body?: unknown,
  token?: string,
) {
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return {
    response,
    body: await parseResponse(response),
  };
}

function announcementForm(
  fields: Partial<{
    title: string;
    description: string;
    price: string;
    category: string;
  }> = {},
  withImage = false,
) {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      form.append(key, value);
    }
  }

  if (withImage) {
    form.append(
      "image",
      new Blob(["fake image bytes"], { type: "image/png" }),
      "test.png",
    );
  }

  return form;
}

async function multipartRequest(
  baseUrl: string,
  path: string,
  method: "POST" | "PATCH",
  form: FormData,
  token?: string,
) {
  const headers = new Headers();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: form,
  });

  return {
    response,
    body: await parseResponse(response),
  };
}

async function tempUploadNames() {
  const uploadsPath = resolve("uploads");
  const names = await readdir(uploadsPath);
  return names.filter((name) => name !== ".gitkeep").sort();
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;

  const started = await startServer(
    createApp({
      allowedOrigins: [ALLOWED_ORIGIN, "http://localhost:3000"],
    }),
  );

  server = started.server;
  baseUrl = started.baseUrl;
});

afterAll(async () => {
  await closeServer(server);
});

beforeEach(() => {
  vi.resetAllMocks();

  prismaMock.$transaction.mockImplementation(async (input: unknown) => {
    if (typeof input === "function") {
      return input(prismaMock);
    }

    return Promise.all(input as Promise<unknown>[]);
  });

  uploadImageToCloudinaryMock.mockResolvedValue(CLOUDINARY_URL);
});

describe("POST /auth/register", () => {
  it("positive: registers a valid user", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue(user);
    prismaMock.refreshToken.create.mockResolvedValue({ id: 1 });

    const { response, body } = await jsonRequest(
      baseUrl,
      "/auth/register",
      "POST",
      {
        username: user.username,
        email: user.email,
        password: "secret1",
        name: user.name,
      },
    );

    expect(response.status).toBe(201);
    expect(body.user).toEqual(user);
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
    expect(body.user.password).toBeUndefined();
  });

  it("negative: rejects a duplicate username or email", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 99 });

    const { response, body } = await jsonRequest(
      baseUrl,
      "/auth/register",
      "POST",
      {
        username: user.username,
        email: user.email,
        password: "secret1",
        name: user.name,
      },
    );

    expect(response.status).toBe(409);
    expect(body).toEqual({ error: "Username or email already taken" });
  });

  it("boundary: accepts a username at the 3-character minimum", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      ...user,
      username: "abc",
      email: "abc@example.com",
    });
    prismaMock.refreshToken.create.mockResolvedValue({ id: 1 });

    const { response } = await jsonRequest(
      baseUrl,
      "/auth/register",
      "POST",
      {
        username: "abc",
        email: "abc@example.com",
        password: "secret1",
        name: "AB",
      },
    );

    expect(response.status).toBe(201);
  });

  it("boundary: rejects a username below the 3-character minimum", async () => {
    const { response } = await jsonRequest(
      baseUrl,
      "/auth/register",
      "POST",
      {
        username: "ab",
        email: "ab@example.com",
        password: "secret1",
        name: "AB",
      },
    );

    expect(response.status).toBe(400);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });
});

describe("POST /auth/login", () => {
  it("positive: logs in with valid credentials", async () => {
    const password = "secret1";
    const hash = await bcrypt.hash(password, 4);

    prismaMock.user.findUnique.mockResolvedValue({
      ...user,
      password: hash,
      createdAt: new Date(),
    });
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.refreshToken.create.mockResolvedValue({ id: 1 });

    const { response, body } = await jsonRequest(
      baseUrl,
      "/auth/login",
      "POST",
      {
        username: user.username,
        password,
      },
    );

    expect(response.status).toBe(200);
    expect(body.user).toEqual(user);
    expect(body.user.password).toBeUndefined();
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
  });

  it("negative: rejects the wrong password", async () => {
    const hash = await bcrypt.hash("correct-password", 4);

    prismaMock.user.findUnique.mockResolvedValue({
      ...user,
      password: hash,
      createdAt: new Date(),
    });

    const { response, body } = await jsonRequest(
      baseUrl,
      "/auth/login",
      "POST",
      {
        username: user.username,
        password: "wrong-password",
      },
    );

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Invalid credentials" });
  });

  it("boundary: rejects empty username and password values", async () => {
    const { response } = await jsonRequest(
      baseUrl,
      "/auth/login",
      "POST",
      {
        username: "",
        password: "",
      },
    );

    expect(response.status).toBe(400);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("POST /auth/refresh", () => {
  it("positive: rotates a valid refresh token", async () => {
    const refreshToken = makeRefreshToken();

    prismaMock.refreshToken.findUnique.mockResolvedValue({
      token: refreshToken,
      userId: user.id,
      user: {
        id: user.id,
        username: user.username,
      },
    });
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.refreshToken.create.mockResolvedValue({ id: 2 });

    const { response, body } = await jsonRequest(
      baseUrl,
      "/auth/refresh",
      "POST",
      { refreshToken },
    );

    expect(response.status).toBe(200);
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
    expect(body.refreshToken).not.toBe(refreshToken);
  });

  it("negative: rejects an access token as a refresh token", async () => {
    const { response, body } = await jsonRequest(
      baseUrl,
      "/auth/refresh",
      "POST",
      {
        refreshToken: makeAccessToken(),
      },
    );

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Invalid or expired refresh token" });
    expect(prismaMock.refreshToken.findUnique).not.toHaveBeenCalled();
  });

  it("boundary: rejects reuse of a refresh token after rotation", async () => {
    const refreshToken = makeRefreshToken();

    prismaMock.refreshToken.findUnique
      .mockResolvedValueOnce({
        token: refreshToken,
        userId: user.id,
        user: {
          id: user.id,
          username: user.username,
        },
      })
      .mockResolvedValueOnce(null);
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.refreshToken.create.mockResolvedValue({ id: 2 });

    const first = await jsonRequest(baseUrl, "/auth/refresh", "POST", {
      refreshToken,
    });
    const second = await jsonRequest(baseUrl, "/auth/refresh", "POST", {
      refreshToken,
    });

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("positive: logs out an authenticated user", async () => {
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

    const { response, body } = await jsonRequest(
      baseUrl,
      "/auth/logout",
      "POST",
      undefined,
      makeAccessToken(),
    );

    expect(response.status).toBe(204);
    expect(body).toBeNull();
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: user.id },
    });
  });

  it("negative: rejects logout without an access token", async () => {
    const { response } = await jsonRequest(
      baseUrl,
      "/auth/logout",
      "POST",
    );

    expect(response.status).toBe(401);
  });

  it("boundary: rejects a refresh token in the Bearer header", async () => {
    const { response } = await jsonRequest(
      baseUrl,
      "/auth/logout",
      "POST",
      undefined,
      makeRefreshToken(),
    );

    expect(response.status).toBe(401);
  });
});

describe("GET /auth/me", () => {
  it("positive: returns the current user profile", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...user,
      createdAt: new Date("2026-08-12T00:00:00.000Z"),
    });

    const { response, body } = await jsonRequest(
      baseUrl,
      "/auth/me",
      "GET",
      undefined,
      makeAccessToken(),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject(user);
    expect(body.password).toBeUndefined();
  });

  it("negative: rejects a request without authentication", async () => {
    const { response } = await jsonRequest(baseUrl, "/auth/me", "GET");
    expect(response.status).toBe(401);
  });

  it("boundary: rejects an expired access token", async () => {
    const { response } = await jsonRequest(
      baseUrl,
      "/auth/me",
      "GET",
      undefined,
      makeAccessToken(user.id, user.username, -1),
    );

    expect(response.status).toBe(401);
  });
});

describe("GET /announcements", () => {
  it("positive: returns a paginated announcement list", async () => {
    prismaMock.announcement.findMany.mockResolvedValue([makeAnnouncement()]);
    prismaMock.announcement.count.mockResolvedValue(1);

    const { response, body } = await jsonRequest(
      baseUrl,
      "/announcements",
      "GET",
    );

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toEqual({
      total: 1,
      page: 1,
      totalPages: 1,
      perPage: 10,
    });
  });

  it("negative: rejects an invalid sort value", async () => {
    const { response } = await jsonRequest(
      baseUrl,
      "/announcements?sort=random",
      "GET",
    );

    expect(response.status).toBe(400);
    expect(prismaMock.announcement.findMany).not.toHaveBeenCalled();
  });

  it("boundary: rejects page 0", async () => {
    const { response } = await jsonRequest(
      baseUrl,
      "/announcements?page=0",
      "GET",
    );

    expect(response.status).toBe(400);
  });

  it("boundary: returns an empty page beyond available results", async () => {
    prismaMock.announcement.findMany.mockResolvedValue([]);
    prismaMock.announcement.count.mockResolvedValue(1);

    const { response, body } = await jsonRequest(
      baseUrl,
      "/announcements?page=999",
      "GET",
    );

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.pagination.page).toBe(999);
  });
});

describe("GET /announcements/:id", () => {
  it("positive: returns an existing announcement", async () => {
    prismaMock.announcement.findUnique.mockResolvedValue(makeAnnouncement());

    const { response, body } = await jsonRequest(
      baseUrl,
      "/announcements/1",
      "GET",
    );

    expect(response.status).toBe(200);
    expect(body.id).toBe(1);
  });

  it("negative: returns 404 for a missing announcement", async () => {
    prismaMock.announcement.findUnique.mockResolvedValue(null);

    const { response, body } = await jsonRequest(
      baseUrl,
      "/announcements/999999",
      "GET",
    );

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Announcement not found" });
  });

  it("boundary: rejects id 0", async () => {
    const { response } = await jsonRequest(
      baseUrl,
      "/announcements/0",
      "GET",
    );

    expect(response.status).toBe(400);
    expect(prismaMock.announcement.findUnique).not.toHaveBeenCalled();
  });
});

describe("POST /announcements", () => {
  it("positive: creates an announcement without an image", async () => {
    prismaMock.announcement.create.mockImplementation(async ({ data }: any) =>
      makeAnnouncement({
        id: 10,
        title: data.title,
        description: data.description,
        price: data.price,
        category: data.category,
        imageUrl: data.imageUrl ?? null,
      }),
    );

    const form = announcementForm({
      title: "Valid title",
      description: "Valid description text",
      price: "100",
      category: "sale",
    });

    const { response, body } = await multipartRequest(
      baseUrl,
      "/announcements",
      "POST",
      form,
      makeAccessToken(),
    );

    expect(response.status).toBe(201);
    expect(body.imageUrl).toBeNull();
    expect(uploadImageToCloudinaryMock).not.toHaveBeenCalled();
  });

  it("positive: uploads an image and stores the Cloudinary URL", async () => {
    const beforeUploads = await tempUploadNames();

    prismaMock.announcement.create.mockImplementation(async ({ data }: any) =>
      makeAnnouncement({
        id: 11,
        title: data.title,
        description: data.description,
        price: data.price,
        category: data.category,
        imageUrl: data.imageUrl ?? null,
      }),
    );

    const form = announcementForm(
      {
        title: "Image title",
        description: "Valid image description",
        price: "250",
        category: "sale",
      },
      true,
    );

    const { response, body } = await multipartRequest(
      baseUrl,
      "/announcements",
      "POST",
      form,
      makeAccessToken(),
    );

    expect(response.status).toBe(201);
    expect(body.imageUrl).toBe(CLOUDINARY_URL);
    expect(uploadImageToCloudinaryMock).toHaveBeenCalledTimes(1);
    expect(await tempUploadNames()).toEqual(beforeUploads);
  });

  it("negative: rejects creation without authentication", async () => {
    const form = announcementForm({
      title: "Valid title",
      description: "Valid description text",
      price: "100",
      category: "sale",
    });

    const { response } = await multipartRequest(
      baseUrl,
      "/announcements",
      "POST",
      form,
    );

    expect(response.status).toBe(401);
    expect(prismaMock.announcement.create).not.toHaveBeenCalled();
  });

  it("boundary: accepts a title exactly 5 characters long", async () => {
    prismaMock.announcement.create.mockImplementation(async ({ data }: any) =>
      makeAnnouncement({
        title: data.title,
        description: data.description,
        price: data.price,
        category: data.category,
      }),
    );

    const form = announcementForm({
      title: "12345",
      description: "1234567890",
      price: "0.01",
      category: "other",
    });

    const { response } = await multipartRequest(
      baseUrl,
      "/announcements",
      "POST",
      form,
      makeAccessToken(),
    );

    expect(response.status).toBe(201);
  });

  it("boundary: rejects a 4-character title and cleans an uploaded temp file", async () => {
    const beforeUploads = await tempUploadNames();

    const form = announcementForm(
      {
        title: "1234",
        description: "1234567890",
        price: "100",
        category: "sale",
      },
      true,
    );

    const { response } = await multipartRequest(
      baseUrl,
      "/announcements",
      "POST",
      form,
      makeAccessToken(),
    );

    expect(response.status).toBe(400);
    expect(prismaMock.announcement.create).not.toHaveBeenCalled();
    expect(uploadImageToCloudinaryMock).not.toHaveBeenCalled();
    expect(await tempUploadNames()).toEqual(beforeUploads);
  });

  it("boundary: rejects price 0", async () => {
    const form = announcementForm({
      title: "Valid title",
      description: "Valid description text",
      price: "0",
      category: "sale",
    });

    const { response } = await multipartRequest(
      baseUrl,
      "/announcements",
      "POST",
      form,
      makeAccessToken(),
    );

    expect(response.status).toBe(400);
  });
});

describe("PATCH /announcements/:id", () => {
  it("positive: updates an owned announcement", async () => {
    prismaMock.announcement.findUnique.mockResolvedValue({ userId: user.id });
    prismaMock.announcement.update.mockImplementation(async ({ data }: any) =>
      makeAnnouncement({
        title: data.title ?? "Valid title",
      }),
    );

    const form = announcementForm({ title: "Updated title" });

    const { response, body } = await multipartRequest(
      baseUrl,
      "/announcements/1",
      "PATCH",
      form,
      makeAccessToken(),
    );

    expect(response.status).toBe(200);
    expect(body.title).toBe("Updated title");
  });

  it("negative: rejects an update owned by another user", async () => {
    prismaMock.announcement.findUnique.mockResolvedValue({
      userId: secondUser.id,
    });

    const form = announcementForm({ title: "Updated title" });

    const { response, body } = await multipartRequest(
      baseUrl,
      "/announcements/1",
      "PATCH",
      form,
      makeAccessToken(),
    );

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Access denied" });
    expect(prismaMock.announcement.update).not.toHaveBeenCalled();
  });

  it("negative: returns 404 for a missing announcement", async () => {
    prismaMock.announcement.findUnique.mockResolvedValue(null);

    const form = announcementForm({ title: "Updated title" });

    const { response } = await multipartRequest(
      baseUrl,
      "/announcements/999999",
      "PATCH",
      form,
      makeAccessToken(),
    );

    expect(response.status).toBe(404);
  });

  it("boundary: allows an image-only update and removes the temp file", async () => {
    const beforeUploads = await tempUploadNames();

    prismaMock.announcement.findUnique.mockResolvedValue({ userId: user.id });
    prismaMock.announcement.update.mockImplementation(async ({ data }: any) =>
      makeAnnouncement({ imageUrl: data.imageUrl ?? null }),
    );

    const form = announcementForm({}, true);

    const { response, body } = await multipartRequest(
      baseUrl,
      "/announcements/1",
      "PATCH",
      form,
      makeAccessToken(),
    );

    expect(response.status).toBe(200);
    expect(body.imageUrl).toBe(CLOUDINARY_URL);
    expect(uploadImageToCloudinaryMock).toHaveBeenCalledTimes(1);
    expect(await tempUploadNames()).toEqual(beforeUploads);
  });

  it("boundary: rejects an empty PATCH", async () => {
    const form = announcementForm();

    const { response } = await multipartRequest(
      baseUrl,
      "/announcements/1",
      "PATCH",
      form,
      makeAccessToken(),
    );

    expect(response.status).toBe(400);
    expect(prismaMock.announcement.findUnique).not.toHaveBeenCalled();
  });

  it("boundary: rejects id 0 before processing the body", async () => {
    const form = announcementForm({ title: "Updated title" });

    const { response } = await multipartRequest(
      baseUrl,
      "/announcements/0",
      "PATCH",
      form,
      makeAccessToken(),
    );

    expect(response.status).toBe(400);
    expect(prismaMock.announcement.findUnique).not.toHaveBeenCalled();
  });
});

describe("DELETE /announcements/:id", () => {
  it("positive: owner can delete an announcement", async () => {
    prismaMock.announcement.findUnique.mockResolvedValue({ userId: user.id });
    prismaMock.announcement.delete.mockResolvedValue(makeAnnouncement());

    const { response, body } = await jsonRequest(
      baseUrl,
      "/announcements/1",
      "DELETE",
      undefined,
      makeAccessToken(),
    );

    expect(response.status).toBe(204);
    expect(body).toBeNull();
    expect(prismaMock.announcement.delete).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });

  it("negative: another user cannot delete the announcement", async () => {
    prismaMock.announcement.findUnique.mockResolvedValue({
      userId: secondUser.id,
    });

    const { response, body } = await jsonRequest(
      baseUrl,
      "/announcements/1",
      "DELETE",
      undefined,
      makeAccessToken(),
    );

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Access denied" });
    expect(prismaMock.announcement.delete).not.toHaveBeenCalled();
  });

  it("boundary: returns 404 when deleting a missing announcement", async () => {
    prismaMock.announcement.findUnique.mockResolvedValue(null);

    const { response } = await jsonRequest(
      baseUrl,
      "/announcements/999999",
      "DELETE",
      undefined,
      makeAccessToken(),
    );

    expect(response.status).toBe(404);
  });

  it("boundary: rejects id 0", async () => {
    const { response } = await jsonRequest(
      baseUrl,
      "/announcements/0",
      "DELETE",
      undefined,
      makeAccessToken(),
    );

    expect(response.status).toBe(400);
  });
});

describe("Global security and API behavior", () => {
  it("positive: Swagger remains available with Helmet headers", async () => {
    const response = await fetch(`${baseUrl}/api-docs/`);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("content-security-policy")).toBeTruthy();
  });

  it("positive: allows an approved CORS origin", async () => {
    prismaMock.announcement.findMany.mockResolvedValue([]);
    prismaMock.announcement.count.mockResolvedValue(0);

    const response = await fetch(`${baseUrl}/announcements`, {
      headers: {
        Origin: ALLOWED_ORIGIN,
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      ALLOWED_ORIGIN,
    );
  });

  it("negative: rejects an unapproved CORS origin", async () => {
    const response = await fetch(`${baseUrl}/announcements`, {
      headers: {
        Origin: "http://evil.example",
      },
    });

    expect(response.status).toBe(403);
    expect(await parseResponse(response)).toEqual({
      error: "Origin not allowed",
    });
  });

  it("negative: returns 404 for an unknown endpoint", async () => {
    const response = await fetch(`${baseUrl}/does-not-exist`);

    expect(response.status).toBe(404);
    expect(await parseResponse(response)).toEqual({ error: "Not found" });
  });

  it("boundary: auth limiter allows 10 requests and blocks request 11", async () => {
    const limiterApp = express();

    limiterApp.use(createAuthRateLimiter({ skipInTest: false }));
    limiterApp.post("/auth/login", (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const limiterServer = await startServer(limiterApp);

    try {
      const statuses: number[] = [];

      for (let index = 0; index < 11; index += 1) {
        const response = await fetch(`${limiterServer.baseUrl}/auth/login`, {
          method: "POST",
        });
        statuses.push(response.status);
      }

      expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
      expect(statuses[10]).toBe(429);
    } finally {
      await closeServer(limiterServer.server);
    }
  });
});