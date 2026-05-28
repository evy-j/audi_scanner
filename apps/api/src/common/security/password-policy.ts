import { env } from "../../config/environment.js";
import { ApiError } from "../errors/api-error.js";

export function assertPasswordPolicy(password: string): void {
  if (password.length < env.PASSWORD_MIN_LENGTH) {
    throw ApiError.badRequest(`Password must be at least ${env.PASSWORD_MIN_LENGTH} characters`);
  }

  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw ApiError.badRequest("Password must include uppercase, lowercase, and numeric characters");
  }
}
