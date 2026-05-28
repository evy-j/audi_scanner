import { PrismaClient } from "@prisma/client";
import { bootstrapAdmin } from "./launch-hardening.js";

if (!process.env.DATABASE_URL) {
  const environment = process.env.NODE_ENV ?? "development";
  console.log(
    JSON.stringify(
      {
        status: "SKIPPED",
        message: "DATABASE_URL is not set. Configure the database before bootstrapping an admin."
      },
      null,
      2
    )
  );
  if (environment === "staging" || environment === "production") {
    process.exitCode = 1;
  }
  process.exit();
}

const prisma = new PrismaClient();

bootstrapAdmin(prisma)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Admin bootstrap failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
