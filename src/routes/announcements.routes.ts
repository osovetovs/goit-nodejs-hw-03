import { Router } from "express";
import { z } from "zod";

import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncementById,
  listAnnouncements,
  updateAnnouncement,
} from "../controllers/announcements.controller.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { uploadAnnouncementImage } from "../middleware/upload.ts";
import {
  validateMultipartBody,
  validateParams,
  validateQuery,
} from "../middleware/validate.ts";
import {
  announcementSchema,
  errorSchema,
  registry,
} from "../openapi.ts";
import {
  announcementCreateSchema,
  announcementIdParamsSchema,
  announcementsQuerySchema,
  announcementUpdateSchema,
} from "../validators/announcements.validator.ts";

const router = Router();

router.get(
  "/",
  validateQuery(announcementsQuerySchema),
  listAnnouncements,
);

router.get(
  "/:id",
  validateParams(announcementIdParamsSchema),
  getAnnouncementById,
);

router.post(
  "/",
  authenticate,
  uploadAnnouncementImage,
  validateMultipartBody(announcementCreateSchema),
  createAnnouncement,
);

router.patch(
  "/:id",
  authenticate,
  validateParams(announcementIdParamsSchema),
  uploadAnnouncementImage,
  validateMultipartBody(announcementUpdateSchema, {
    requireBodyOrFile: true,
  }),
  updateAnnouncement,
);

router.delete(
  "/:id",
  authenticate,
  validateParams(announcementIdParamsSchema),
  deleteAnnouncement,
);

const idParam = z
  .string()
  .regex(/^\d+$/)
  .openapi({
    example: "1",
  });

const imageFieldSchema = z.string().openapi({
  type: "string",
  format: "binary",
  description: "Optional announcement image",
});

const announcementMultipartCreateSchema = z.object({
  title: z
    .string()
    .min(5)
    .max(50)
    .openapi({
      example: "Bike for sale",
    }),

  description: z
    .string()
    .min(10)
    .openapi({
      example: "Trek bike in excellent condition",
    }),

  price: z
    .number()
    .positive()
    .openapi({
      example: 8500,
    }),

  category: z
    .enum(["sale", "service", "job", "other"])
    .openapi({
      example: "sale",
    }),

  image: imageFieldSchema.optional(),
});

const announcementMultipartUpdateSchema = z.object({
  title: z.string().min(5).max(50).optional(),
  description: z.string().min(10).optional(),
  price: z.number().positive().optional(),
  category: z.enum(["sale", "service", "job", "other"]).optional(),
  image: imageFieldSchema.optional(),
});

registry.registerPath({
  method: "get",
  path: "/announcements",
  tags: ["Announcements"],
  summary: "List announcements",
  request: {
    query: announcementsQuerySchema,
  },
  responses: {
    200: {
      description: "Paginated announcement list",
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(announcementSchema),
            pagination: z.object({
              total: z.number().int().nonnegative(),
              page: z.number().int().positive(),
              totalPages: z.number().int().nonnegative(),
              perPage: z.literal(10),
            }),
          }),
        },
      },
    },
    400: {
      description: "Validation failed",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/announcements/{id}",
  tags: ["Announcements"],
  summary: "Get announcement by ID",
  request: {
    params: z.object({
      id: idParam,
    }),
  },
  responses: {
    200: {
      description: "Announcement",
      content: {
        "application/json": {
          schema: announcementSchema,
        },
      },
    },
    404: {
      description: "Announcement not found",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/announcements",
  tags: ["Announcements"],
  summary: "Create an announcement with an optional image",
  security: [
    {
      bearerAuth: [],
    },
  ],
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: announcementMultipartCreateSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: "Announcement created",
      content: {
        "application/json": {
          schema: announcementSchema,
        },
      },
    },
    400: {
      description: "Validation failed",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/announcements/{id}",
  tags: ["Announcements"],
  summary: "Update an owned announcement with an optional image",
  security: [
    {
      bearerAuth: [],
    },
  ],
  request: {
    params: z.object({
      id: idParam,
    }),
    body: {
      content: {
        "multipart/form-data": {
          schema: announcementMultipartUpdateSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Announcement updated",
      content: {
        "application/json": {
          schema: announcementSchema,
        },
      },
    },
    400: {
      description: "Validation failed",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    403: {
      description: "Access denied",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    404: {
      description: "Announcement not found",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: "delete",
  path: "/announcements/{id}",
  tags: ["Announcements"],
  summary: "Delete an owned announcement",
  security: [
    {
      bearerAuth: [],
    },
  ],
  request: {
    params: z.object({
      id: idParam,
    }),
  },
  responses: {
    204: {
      description: "Announcement deleted",
    },
    401: {
      description: "Unauthorized",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    403: {
      description: "Access denied",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
    404: {
      description: "Announcement not found",
      content: {
        "application/json": {
          schema: errorSchema,
        },
      },
    },
  },
});

export default router;