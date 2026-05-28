import jwt from "jsonwebtoken";
import { env } from "../../config/environment.js";
import type { AuthPrincipal } from "./auth-principal.js";
import { ApiError } from "../errors/api-error.js";

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  org?: string;
  permissions?: string[];
  scopes?: string[];
  typ: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  typ: "refresh";
}

export class TokenService {
  issueAccessToken(input: {
    userId: string;
    sessionId: string;
    organizationId?: string | undefined;
    permissions?: string[] | undefined;
    scopes?: string[] | undefined;
  }): string {
    const payload: AccessTokenPayload = {
      sub: input.userId,
      sid: input.sessionId,
      typ: "access",
      ...(input.organizationId ? { org: input.organizationId } : {}),
      ...(input.permissions ? { permissions: input.permissions } : {}),
      ...(input.scopes ? { scopes: input.scopes } : {})
    };

    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_TTL_SECONDS,
      issuer: "audit-scanner-api",
      audience: "audit-scanner"
    });
  }

  issueRefreshToken(input: { userId: string; sessionId: string }): string {
    const payload: RefreshTokenPayload = {
      sub: input.userId,
      sid: input.sessionId,
      typ: "refresh"
    };

    return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_TTL_SECONDS,
      issuer: "audit-scanner-api",
      audience: "audit-scanner"
    });
  }

  verifyAccessToken(token: string): AuthPrincipal {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: "audit-scanner-api",
      audience: "audit-scanner"
    });

    if (!isAccessTokenPayload(decoded)) {
      throw ApiError.unauthorized("Invalid access token");
    }

    return {
      type: "user",
      userId: decoded.sub,
      sessionId: decoded.sid,
      ...(decoded.org ? { organizationId: decoded.org } : {}),
      permissions: decoded.permissions ?? [],
      scopes: decoded.scopes ?? []
    };
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      issuer: "audit-scanner-api",
      audience: "audit-scanner"
    });

    if (!isRefreshTokenPayload(decoded)) {
      throw ApiError.unauthorized("Invalid refresh token");
    }

    return decoded;
  }
}

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as AccessTokenPayload).typ === "access" &&
    typeof (value as AccessTokenPayload).sub === "string" &&
    typeof (value as AccessTokenPayload).sid === "string"
  );
}

function isRefreshTokenPayload(value: unknown): value is RefreshTokenPayload {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as RefreshTokenPayload).typ === "refresh" &&
    typeof (value as RefreshTokenPayload).sub === "string" &&
    typeof (value as RefreshTokenPayload).sid === "string"
  );
}

export const tokenService = new TokenService();
