import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1),
  displayName: z.string().min(1).max(120).optional()
});

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1)
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(32)
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(32).optional()
});

export const walletNonceSchema = z.object({
  address: z.string().min(20).max(128),
  chainId: z.string().uuid().optional()
});

export const walletVerifySchema = z.object({
  address: z.string().min(20).max(128),
  chainId: z.string().uuid().optional(),
  nonceToken: z.string().min(32),
  message: z.string().min(1).max(4000),
  signature: z.string().min(32).max(2048)
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type WalletNonceInput = z.infer<typeof walletNonceSchema>;
export type WalletVerifyInput = z.infer<typeof walletVerifySchema>;
