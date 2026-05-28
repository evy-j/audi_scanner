import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  auditScannerPrisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.auditScannerPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? ["error"]
        : ["query", "warn", "error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.auditScannerPrisma = prisma;
}

export type AppPrismaClient = typeof prisma;
