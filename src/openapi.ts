import {
  extendZodWithOpenApi,
  OpenApiGeneratorV3,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

export const errorSchema = z.object({
  error: z.string(),
});

export const publicUserSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  email: z.string().email(),
  name: z.string(),
});

export const profileUserSchema = publicUserSchema.extend({
  createdAt: z.string().datetime(),
});

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const announcementSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  description: z.string(),
  price: z.number(),
  category: z.enum(["sale", "service", "job", "other"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  user: publicUserSchema,
});

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "Announcements REST API",
      version: "1.0.0",
      description:
        "REST API for a bulletin board with JWT authentication, refresh token rotation and ownership checks.",
    },
    servers: [{ url: "http://localhost:3000" }],
  });
}
