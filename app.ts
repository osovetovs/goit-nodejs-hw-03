import "dotenv/config";

import cookieParser from "cookie-parser";
import cors, { type CorsOptions } from "cors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import createHttpError from "http-errors";
import { pinoHttp } from "pino-http";
import swaggerUi from "swagger-ui-express";

import logger from "./src/logger.ts";
import { generateOpenApiDocument } from "./src/openapi.ts";
import announcementsRoutes from "./src/routes/announcements.routes.ts";
import authRoutes from "./src/routes/auth.routes.ts";

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(createHttpError(403, "Origin not allowed"));
  },
};

app.use(pinoHttp({ logger }));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
  }),
);

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

app.use("/auth", authRoutes);
app.use("/announcements", announcementsRoutes);

const openApiDocument = generateOpenApiDocument();
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Request failed");

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      error: "Validation failed",
      details: {
        body: ["Invalid JSON format in request body"],
      },
    });
  }

  if (err.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err.code === "P2025") {
    return res.status(404).json({ error: "Resource not found" });
  }

  if (err.code === "P2002") {
    return res.status(409).json({ error: "Username or email already taken" });
  }

  if (err.code === "P2003") {
    return res.status(400).json({ error: "Foreign key constraint failed" });
  }

  return res.status(500).json({ error: "Internal server error" });
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  logger.info({ port: PORT }, `Server is running at http://localhost:${PORT}`);
  logger.info(`Swagger UI: http://localhost:${PORT}/api-docs`);
});