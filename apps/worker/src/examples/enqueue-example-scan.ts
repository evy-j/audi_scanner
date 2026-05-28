import { randomUUID } from "node:crypto";
import { QueueRegistry } from "../queues/queue-registry.js";
import { ScanJobProducer } from "../queues/scan-job.producer.js";

const queueRegistry = new QueueRegistry();
const producer = new ScanJobProducer(queueRegistry);

try {
  const scanId = randomUUID();
  const organizationId = randomUUID();

  await producer.enqueueScan({
    scanId,
    organizationId,
    requestedByUserId: randomUUID(),
    traceId: randomUUID(),
    priority: "NORMAL",
    target: {
      type: "SOURCE",
      artifactKey: `uploads/${organizationId}/${scanId}/source.tar.gz`
    },
    analyzers: ["slither", "mythril", "semgrep", "foundry"]
  });

  console.log(
    JSON.stringify({
      message: "scan enqueued",
      scanId,
      organizationId
    })
  );
} finally {
  await queueRegistry.close();
}
