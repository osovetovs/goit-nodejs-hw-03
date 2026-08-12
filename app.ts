import "dotenv/config";

import { createApp } from "./src/app.ts";
import logger from "./src/logger.ts";

const PORT = Number(process.env.PORT) || 3000;
const app = createApp();

app.listen(PORT, () => {
  logger.info({ port: PORT }, `Server is running at http://localhost:${PORT}`);
  logger.info(`Swagger UI: http://localhost:${PORT}/api-docs`);
});