import type { AuthPrincipal } from "../common/security/auth-principal.js";

declare global {
  namespace Express {
    interface Request {
      id?: string;
      traceId?: string;
      correlationId?: string;
      rawBody?: Buffer;
      auth?: AuthPrincipal;
    }
  }
}

export {};
