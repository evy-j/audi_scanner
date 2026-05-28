import { Router } from "express";
import { authRateLimit } from "../../common/middleware/rate-limit.middleware.js";
import { validateRequest } from "../../common/validation/validate-request.js";
import { asyncHandler } from "../../common/middleware/async-handler.js";
import { authenticateJwt } from "../../common/middleware/authenticate.middleware.js";
import { auditLog } from "../../common/middleware/audit-log.middleware.js";
import { AuthController } from "./auth.controller.js";
import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  signupSchema,
  walletNonceSchema,
  walletVerifySchema
} from "./auth.schemas.js";

const controller = new AuthController();

export const authRoutes = Router();

authRoutes.post(
  "/signup",
  authRateLimit,
  validateRequest({ body: signupSchema }),
  auditLog("CREATE", "USER"),
  asyncHandler(controller.signup)
);

authRoutes.post(
  "/login",
  authRateLimit,
  validateRequest({ body: loginSchema }),
  auditLog("LOGIN", "SESSION"),
  asyncHandler(controller.login)
);

authRoutes.post(
  "/refresh",
  authRateLimit,
  validateRequest({ body: refreshSchema }),
  asyncHandler(controller.refresh)
);

authRoutes.post(
  "/logout",
  authenticateJwt,
  validateRequest({ body: logoutSchema }),
  auditLog("LOGOUT", "SESSION"),
  asyncHandler(controller.logout)
);

authRoutes.get("/me", authenticateJwt, asyncHandler(controller.me));

authRoutes.post(
  "/wallet/nonce",
  authRateLimit,
  validateRequest({ body: walletNonceSchema }),
  asyncHandler(controller.walletNonce)
);

authRoutes.post(
  "/wallet/verify",
  authRateLimit,
  validateRequest({ body: walletVerifySchema }),
  auditLog("LOGIN", "WALLET"),
  asyncHandler(controller.walletVerify)
);
