import type { Express } from "express";
import { createApiApp } from "../../apps/api/src/app.js";

export function createTestApiApp(): Express {
  return createApiApp();
}
