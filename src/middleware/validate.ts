import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

import { removeTempUpload } from "./upload.ts";

function formatIssues(issues: { path: PropertyKey[]; message: string }[]) {
  return issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

function validationError(
  res: Response,
  target: "body" | "params" | "query",
  issues: { path: PropertyKey[]; message: string }[],
) {
  return res.status(400).json({
    error: "Validation failed",
    details: {
      [target]: formatIssues(issues),
    },
  });
}

export const validateBody = (schema: ZodType) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return validationError(res, "body", result.error.issues);
    }

    req.validatedBody = result.data;
    next();
  };

export const validateMultipartBody = (
  schema: ZodType,
  options: { requireBodyOrFile?: boolean } = {},
) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      await removeTempUpload(req.file?.path);
      return validationError(res, "body", result.error.issues);
    }

    const parsedBody = result.data;

    const hasBodyFields =
      typeof parsedBody === "object" &&
      parsedBody !== null &&
      Object.keys(parsedBody).length > 0;

    if (options.requireBodyOrFile && !hasBodyFields && !req.file) {
      return validationError(res, "body", [
        {
          path: [],
          message: "At least one field or image must be provided",
        },
      ]);
    }

    req.validatedBody = parsedBody;
    next();
  };

export const validateParams = (schema: ZodType) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      return validationError(res, "params", result.error.issues);
    }

    req.validatedParams = result.data;
    next();
  };

export const validateQuery = (schema: ZodType) =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      return validationError(res, "query", result.error.issues);
    }

    req.validatedQuery = result.data;
    next();
  };