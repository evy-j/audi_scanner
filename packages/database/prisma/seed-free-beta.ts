import { PrismaClient } from "@prisma/client";
import { seedFreeBetaPlan } from "./launch-hardening.js";

if (!process.env.DATABASE_URL) {
  const environment = process.env.NODE_ENV ?? "development";
  const payload = {
    seeded: false,
    skipped: true,
    reason: "DATABASE_URL is not set"
  };
  console.log(JSON.stringify(payload, null, 2));
  if (environment === "staging" || environment === "production") {
    process.exitCode = 1;
  }
  process.exit();
}

const prisma = new PrismaClient();

seedFreeBetaPlan(prisma)
  .then((result) => {
    console.log(
      JSON.stringify(
        {
          seeded: true,
          created: result.created,
          plan: {
            id: result.plan.id,
            tier: result.plan.tier,
            name: result.plan.name
          }
        },
        null,
        2
      )
    );
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Free beta seed failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
