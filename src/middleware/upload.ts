import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import type { RequestHandler } from "express";
import createHttpError from "http-errors";
import multer from "multer";

import logger from "../logger.ts";

const uploadsDirectory = resolve("uploads");

mkdirSync(uploadsDirectory, { recursive: true });

const upload = multer({
  dest: uploadsDirectory,
});

export const uploadAnnouncementImage: RequestHandler = (req, res, next) => {
  upload.single("image")(req, res, (error) => {
    if (error) {
      return next(createHttpError(400, error.message));
    }

    next();
  });
};

export async function removeTempUpload(filePath?: string) {
  if (!filePath) {
    return;
  }

  try {
    await unlink(filePath);
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;

    if (fsError.code !== "ENOENT") {
      logger.warn({ err: error, filePath }, "Failed to delete temporary upload");
    }
  }
}