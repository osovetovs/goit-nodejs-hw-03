import type { JwtPayload } from "jsonwebtoken";

declare global {
  namespace Express {
    interface AuthUser extends JwtPayload {
      sub: string;
      username: string;
      type: "access";
    }

    interface Request {
      user?: AuthUser;
      validatedBody?: unknown;
      validatedParams?: unknown;
      validatedQuery?: unknown;
    }
  }
}

export {};
