import { createHmac, randomBytes } from "node:crypto";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import type { User } from "@prisma/client";
import { getAddress, verifyMessage } from "viem";
import { env } from "../../config/environment.js";
import { ApiError } from "../../common/errors/api-error.js";
import { assertPasswordPolicy } from "../../common/security/password-policy.js";
import { tokenService } from "../../common/security/token.service.js";
import { redis, redisKey } from "../../infra/queues/redis.js";
import { AuthRepository } from "./auth.repository.js";
import type {
  LoginInput,
  RefreshInput,
  SignupInput,
  WalletNonceInput,
  WalletVerifyInput
} from "./auth.schemas.js";

const WALLET_NONCE_TTL_SECONDS = 300;

export class AuthService {
  constructor(private readonly repository = new AuthRepository()) {}

  async signup(input: SignupInput) {
    assertPasswordPolicy(input.password);

    const existing = await this.repository.findUserByEmail(input.email);
    if (existing && !existing.deletedAt) {
      throw ApiError.conflict("An account already exists for this email");
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id
    });
    const user = await this.repository.createPendingUser({
      email: input.email,
      passwordHash,
      ...(input.displayName ? { displayName: input.displayName } : {})
    });

    return {
      userId: user.id,
      email: user.email,
      status: user.status,
      emailVerificationRequired: false
    };
  }

  async login(input: LoginInput, context: { ipAddress?: string; userAgent?: string }) {
    const user = await this.repository.findUserByEmail(input.email);

    if (!user || !user.passwordHash || user.deletedAt) {
      throw ApiError.unauthorized("Invalid credentials");
    }

    if (user.status !== "ACTIVE") {
      throw ApiError.forbidden("Account is not active");
    }

    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) {
      throw ApiError.unauthorized("Invalid credentials");
    }

    return this.issueSessionForUser(user, context);
  }

  async refresh(input: RefreshInput) {
    const payload = tokenService.verifyRefreshToken(input.refreshToken);
    const session = await this.repository.findSessionByRefreshHash(hashRefreshToken(input.refreshToken));

    if (
      !session ||
      session.id !== payload.sid ||
      session.userId !== payload.sub ||
      session.status !== "ACTIVE" ||
      session.expiresAt <= new Date() ||
      session.deletedAt ||
      session.user.deletedAt ||
      session.user.status !== "ACTIVE"
    ) {
      throw ApiError.unauthorized("Invalid refresh token");
    }

    const permissions = await this.repository.getUserPermissions(session.userId);
    const accessToken = tokenService.issueAccessToken({
      userId: session.userId,
      sessionId: session.id,
      permissions
    });
    const refreshToken = tokenService.issueRefreshToken({
      userId: session.userId,
      sessionId: session.id
    });

    await this.repository.updateSessionRefreshHash(session.id, hashRefreshToken(refreshToken));
    await this.repository.touchSession(session.id);

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: env.JWT_ACCESS_TTL_SECONDS
    };
  }

  async logout(refreshToken?: string | undefined, sessionId?: string | undefined) {
    if (refreshToken) {
      const session = await this.repository.findSessionByRefreshHash(hashRefreshToken(refreshToken));
      if (session) {
        await this.repository.revokeSession(session.id);
      }
    } else if (sessionId) {
      await this.repository.revokeSession(sessionId);
    }

    return { ok: true };
  }

  async getMe(userId: string) {
    const user = await this.repository.findUserById(userId);
    if (!user || user.deletedAt) {
      throw ApiError.notFound("User");
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt
    };
  }

  async createWalletNonce(input: WalletNonceInput) {
    const nonce = randomBytes(24).toString("base64url");
    const nonceId = randomBytes(16).toString("base64url");
    const normalizedAddress = normalizeAddress(input.address);
    const issuedAt = new Date().toISOString();
    const message = [
      "Audit Scanner wants you to sign in with your wallet.",
      "",
      `Address: ${normalizedAddress}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`
    ].join("\n");

    await redis.set(
      walletNonceRedisKey(nonceId),
      JSON.stringify({
        address: normalizedAddress,
        nonce,
        chainId: input.chainId ?? null,
        message,
        issuedAt
      }),
      "EX",
      WALLET_NONCE_TTL_SECONDS
    );

    return {
      address: normalizedAddress,
      chainId: input.chainId ?? null,
      nonce,
      message,
      nonceToken: jwt.sign(
        {
          typ: "wallet-nonce",
          nonceId,
          address: normalizedAddress,
          nonce,
          ...(input.chainId ? { chainId: input.chainId } : {})
        },
        env.JWT_ACCESS_SECRET,
        {
          expiresIn: WALLET_NONCE_TTL_SECONDS,
          issuer: "audit-scanner-api",
          audience: "audit-scanner-wallet"
        }
      ),
      expiresIn: WALLET_NONCE_TTL_SECONDS
    };
  }

  async verifyWallet(
    input: WalletVerifyInput,
    context: { ipAddress?: string; userAgent?: string } = {}
  ) {
    const normalizedAddress = normalizeAddress(input.address);
    const { tokenPayload, storedNonce } = await consumeWalletNonce(input.nonceToken);

    if (
      tokenPayload.address !== normalizedAddress ||
      storedNonce.address !== normalizedAddress ||
      storedNonce.nonce !== tokenPayload.nonce ||
      storedNonce.message !== input.message
    ) {
      throw ApiError.unauthorized("Wallet nonce verification failed");
    }

    if (
      (input.chainId && tokenPayload.chainId && input.chainId !== tokenPayload.chainId) ||
      ((storedNonce.chainId ?? undefined) !== (tokenPayload.chainId ?? undefined))
    ) {
      throw ApiError.unauthorized("Wallet chain verification failed");
    }

    const valid = await verifyMessage({
      address: normalizedAddress,
      message: input.message,
      signature: input.signature as `0x${string}`
    });

    if (!valid) {
      throw ApiError.unauthorized("Invalid wallet signature");
    }

    const walletLookup = {
      normalizedAddress,
      ...(input.chainId ? { chainId: input.chainId } : {})
    };
    const existingWallet = await this.repository.findWalletByAddress(walletLookup);

    if (existingWallet && (existingWallet.user.deletedAt || existingWallet.user.status !== "ACTIVE")) {
      throw ApiError.forbidden("Wallet account is not active");
    }

    const walletRecord = existingWallet
      ? { user: existingWallet.user, wallet: existingWallet }
      : await this.repository.createWalletUser({
        normalizedAddress,
        ...(input.chainId ? { chainId: input.chainId } : {})
      });

    if (existingWallet) {
      await this.repository.touchWallet(existingWallet.id);
    }

    const user = walletRecord.user;
    const wallet = walletRecord.wallet;
    const session = await this.issueSessionForUser(user, context);

    return {
      ...session,
      wallet: {
        id: wallet.id,
        address: wallet.normalizedAddress,
        chainId: wallet.chainId
      }
    };
  }

  private async issueSessionForUser(
    user: User,
    context: { ipAddress?: string; userAgent?: string } = {}
  ) {
    const session = await this.repository.createSession({
      userId: user.id,
      ...(context.ipAddress ? { ipAddress: context.ipAddress } : {}),
      ...(context.userAgent ? { userAgent: context.userAgent } : {}),
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1000)
    });
    const permissions = await this.repository.getUserPermissions(user.id);
    const accessToken = tokenService.issueAccessToken({
      userId: user.id,
      sessionId: session.id,
      permissions
    });
    const refreshToken = tokenService.issueRefreshToken({
      userId: user.id,
      sessionId: session.id
    });

    await this.repository.updateSessionRefreshHash(session.id, hashRefreshToken(refreshToken));

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: env.JWT_ACCESS_TTL_SECONDS,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName
      }
    };
  }
}

function hashRefreshToken(token: string): string {
  return createHmac("sha256", env.JWT_REFRESH_SECRET).update(token).digest("hex");
}

function normalizeAddress(address: string): `0x${string}` {
  try {
    return getAddress(address);
  } catch {
    throw ApiError.badRequest("Invalid wallet address");
  }
}

function verifyWalletNonceToken(token: string): {
  nonceId: string;
  address: `0x${string}`;
  nonce: string;
  chainId?: string | undefined;
} {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: "audit-scanner-api",
      audience: "audit-scanner-wallet"
    });

    if (
      !decoded ||
      typeof decoded !== "object" ||
      (decoded as { typ?: string }).typ !== "wallet-nonce" ||
      typeof (decoded as { nonceId?: unknown }).nonceId !== "string" ||
      typeof (decoded as { address?: unknown }).address !== "string" ||
      typeof (decoded as { nonce?: unknown }).nonce !== "string"
    ) {
      throw ApiError.unauthorized("Invalid wallet nonce token");
    }

    return {
      nonceId: (decoded as { nonceId: string }).nonceId,
      address: normalizeAddress((decoded as { address: string }).address),
      nonce: (decoded as { nonce: string }).nonce,
      chainId:
        typeof (decoded as { chainId?: unknown }).chainId === "string"
          ? (decoded as { chainId: string }).chainId
          : undefined
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw ApiError.unauthorized("Invalid or expired wallet nonce token");
  }
}

async function consumeWalletNonce(token: string): Promise<{
  tokenPayload: ReturnType<typeof verifyWalletNonceToken>;
  storedNonce: {
    address: `0x${string}`;
    nonce: string;
    chainId: string | null;
    message: string;
    issuedAt: string;
  };
}> {
  const tokenPayload = verifyWalletNonceToken(token);
  const stored = (await redis.call("GETDEL", walletNonceRedisKey(tokenPayload.nonceId))) as string | null;

  if (!stored) {
    throw ApiError.unauthorized("Wallet nonce is expired or already used");
  }

  return {
    tokenPayload,
    storedNonce: parseStoredWalletNonce(stored)
  };
}

function parseStoredWalletNonce(value: string): {
  address: `0x${string}`;
  nonce: string;
  chainId: string | null;
  message: string;
  issuedAt: string;
} {
  try {
    const parsed = JSON.parse(value) as {
      address?: unknown;
      nonce?: unknown;
      chainId?: unknown;
      message?: unknown;
      issuedAt?: unknown;
    };

    if (
      typeof parsed.address !== "string" ||
      typeof parsed.nonce !== "string" ||
      !(typeof parsed.chainId === "string" || parsed.chainId === null) ||
      typeof parsed.message !== "string" ||
      typeof parsed.issuedAt !== "string"
    ) {
      throw ApiError.unauthorized("Invalid wallet nonce state");
    }

    return {
      address: normalizeAddress(parsed.address),
      nonce: parsed.nonce,
      chainId: typeof parsed.chainId === "string" ? parsed.chainId : null,
      message: parsed.message,
      issuedAt: parsed.issuedAt
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw ApiError.unauthorized("Invalid wallet nonce state");
  }
}

function walletNonceRedisKey(nonceId: string): string {
  return redisKey("auth", "wallet-nonce", nonceId);
}
