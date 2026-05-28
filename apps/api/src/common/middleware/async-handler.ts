import type { NextFunction, Request, RequestHandler, Response } from "express";

export function asyncHandler<T extends Request = Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    void handler(req as T, res, next).catch(next);
  };
}
