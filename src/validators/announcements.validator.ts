import { z } from "zod";

export const announcementCreateSchema = z.object({
  title: z.string().trim().min(5).max(50),
  description: z.string().trim().min(10),
  price: z.number().positive(),
  category: z.enum(["sale", "service", "job", "other"]),
});

export const announcementUpdateSchema = announcementCreateSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const announcementIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const announcementsQuerySchema = z.object({
  search: z.string().trim().optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
  page: z.coerce.number().int().positive().default(1),
});

export type AnnouncementCreateInput = z.infer<typeof announcementCreateSchema>;
export type AnnouncementUpdateInput = z.infer<typeof announcementUpdateSchema>;
export type AnnouncementIdParams = z.infer<typeof announcementIdParamsSchema>;
export type AnnouncementsQuery = z.infer<typeof announcementsQuerySchema>;
