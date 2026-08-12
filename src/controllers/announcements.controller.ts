import type { Request, Response } from "express";
import createHttpError from "http-errors";

import prisma from "../../prisma/client.ts";
import logger from "../logger.ts";
import { removeTempUpload } from "../middleware/upload.ts";
import { uploadImageToCloudinary } from "../services/cloudinary.ts";
import type {
  AnnouncementCreateInput,
  AnnouncementIdParams,
  AnnouncementsQuery,
  AnnouncementUpdateInput,
} from "../validators/announcements.validator.ts";

const PER_PAGE = 10;

const announcementSelect = {
  id: true,
  title: true,
  description: true,
  price: true,
  category: true,
  imageUrl: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
    },
  },
} as const;

export async function listAnnouncements(req: Request, res: Response) {
  const { search, sort, page } = req.validatedQuery as AnnouncementsQuery;

  const where = search
    ? {
        title: {
          contains: search,
          mode: "insensitive" as const,
        },
      }
    : {};

  const [data, total] = await prisma.$transaction([
    prisma.announcement.findMany({
      where,
      select: announcementSelect,
      orderBy: { createdAt: sort === "oldest" ? "asc" : "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.announcement.count({ where }),
  ]);

  res.status(200).json({
    data,
    pagination: {
      total,
      page,
      totalPages: Math.ceil(total / PER_PAGE),
      perPage: PER_PAGE,
    },
  });
}

export async function getAnnouncementById(req: Request, res: Response) {
  const { id } = req.validatedParams as AnnouncementIdParams;

  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select: announcementSelect,
  });

  if (!announcement) {
    throw createHttpError(404, "Announcement not found");
  }

  res.status(200).json(announcement);
}

export async function createAnnouncement(req: Request, res: Response) {
  const input = req.validatedBody as AnnouncementCreateInput;
  const userId = Number(req.user?.sub);
  const tempFilePath = req.file?.path;

  try {
    const imageUrl = req.file
      ? await uploadImageToCloudinary(req.file.path)
      : undefined;

    const announcement = await prisma.announcement.create({
      data: {
        ...input,
        userId,
        ...(imageUrl ? { imageUrl } : {}),
      },
      select: announcementSelect,
    });

    logger.info(
      {
        announcementId: announcement.id,
        userId,
      },
      "Announcement created",
    );

    if (imageUrl) {
      logger.info(
        {
          announcementId: announcement.id,
          userId,
          imageUrl,
        },
        "Announcement photo uploaded",
      );
    }

    res.status(201).json(announcement);
  } finally {
    await removeTempUpload(tempFilePath);
  }
}

export async function updateAnnouncement(req: Request, res: Response) {
  const { id } = req.validatedParams as AnnouncementIdParams;
  const input = req.validatedBody as AnnouncementUpdateInput;
  const userId = Number(req.user?.sub);
  const tempFilePath = req.file?.path;

  try {
    const existing = await prisma.announcement.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!existing) {
      throw createHttpError(404, "Announcement not found");
    }

    if (existing.userId !== userId) {
      throw createHttpError(403, "Access denied");
    }

    const imageUrl = req.file
      ? await uploadImageToCloudinary(req.file.path)
      : undefined;

    const announcement = await prisma.announcement.update({
      where: { id },
      data: {
        ...input,
        ...(imageUrl ? { imageUrl } : {}),
      },
      select: announcementSelect,
    });

    if (imageUrl) {
      logger.info(
        {
          announcementId: announcement.id,
          userId,
          imageUrl,
        },
        "Announcement photo uploaded",
      );
    }

    res.status(200).json(announcement);
  } finally {
    await removeTempUpload(tempFilePath);
  }
}

export async function deleteAnnouncement(req: Request, res: Response) {
  const { id } = req.validatedParams as AnnouncementIdParams;
  const userId = Number(req.user?.sub);

  const existing = await prisma.announcement.findUnique({
    where: { id },
    select: { userId: true },
  });

  if (!existing) {
    throw createHttpError(404, "Announcement not found");
  }

  if (existing.userId !== userId) {
    throw createHttpError(403, "Access denied");
  }

  await prisma.announcement.delete({
    where: { id },
  });

  res.status(204).end();
}