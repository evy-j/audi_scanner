import type { RequestHandler } from "express";
import type { z } from "zod";
import { ApiError } from "../errors/api-error.js";

export function validateRequest(schema: {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
}): RequestHandler {
  return (req, _res, next) => {
    const result = {
      body: schema.body?.safeParse(req.body),
      query: schema.query?.safeParse(req.query),
      params: schema.params?.safeParse(req.params)
    };

    const errors = Object.entries(result)
      .filter(([, value]) => value && !value.success)
      .map(([key, value]) => ({
        location: key,
        issues: value && !value.success ? value.error.flatten() : undefined
      }));

    if (errors.length > 0) {
      next(ApiError.validation(errors));
      return;
    }

    if (result.body?.success) req.body = result.body.data;
    if (result.query?.success) req.query = result.query.data;
    if (result.params?.success) req.params = result.params.data;

    next();
  };
}
