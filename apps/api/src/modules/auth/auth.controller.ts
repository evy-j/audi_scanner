import type { Request, Response } from "express";
import { ApiError } from "../../common/errors/api-error.js";
import { AuthService } from "./auth.service.js";

export class AuthController {
  constructor(private readonly service = new AuthService()) {}

  signup = async (req: Request, res: Response) => {
    res.status(201).json(await this.service.signup(req.body));
  };

  login = async (req: Request, res: Response) => {
    const userAgent = req.header("user-agent");
    res.json(
      await this.service.login(req.body, {
        ...(req.ip ? { ipAddress: req.ip } : {}),
        ...(userAgent ? { userAgent } : {})
      })
    );
  };

  refresh = async (req: Request, res: Response) => {
    res.json(await this.service.refresh(req.body));
  };

  logout = async (req: Request, res: Response) => {
    const sessionId = req.auth?.type === "user" ? req.auth.sessionId : undefined;
    res.json(await this.service.logout(req.body.refreshToken, sessionId));
  };

  me = async (req: Request, res: Response) => {
    if (!req.auth?.userId) {
      throw ApiError.unauthorized();
    }

    res.json(await this.service.getMe(req.auth.userId));
  };

  walletNonce = async (req: Request, res: Response) => {
    res.json(await this.service.createWalletNonce(req.body));
  };

  walletVerify = async (req: Request, res: Response) => {
    const userAgent = req.header("user-agent");
    res.json(
      await this.service.verifyWallet(req.body, {
        ...(req.ip ? { ipAddress: req.ip } : {}),
        ...(userAgent ? { userAgent } : {})
      })
    );
  };
}
