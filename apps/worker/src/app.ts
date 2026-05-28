import { SCAN_QUEUE_NAMES } from "@audit-scanner/shared/queues/scan-jobs";
import { prisma } from "@audit-scanner/database";
import { env, getWorkerId } from "./config/environment.js";
import { logger } from "./common/logger.js";
import { createRedisConnection } from "./redis/redis-connection.js";
import { PersistentScanLifecycleStore } from "./lifecycle/scan-lifecycle.service.js";
import { QueueRegistry } from "./queues/queue-registry.js";
import { WorkerHeartbeatService } from "./queues/heartbeat.service.js";
import { WorkerRegistry } from "./queues/worker-registry.js";
import { ScanStageCoordinator } from "./queues/scan-stage-coordinator.js";
import { ScanControlService } from "./queues/scan-control.service.js";
import { createScanOrchestratorProcessor } from "./processors/scan-orchestrator.processor.js";
import { createSourcePrepareProcessor } from "./processors/source-prepare.processor.js";
import { createBuildProcessor } from "./processors/build.processor.js";
import { createAnalyzerProcessor } from "./processors/analyzer.processor.js";
import { createFindingsNormalizeProcessor } from "./processors/findings-normalize.processor.js";
import { createRiskScoreProcessor } from "./processors/risk-score.processor.js";
import { createAiValidationProcessor } from "./processors/ai-validation.processor.js";
import {
  createAiReportProcessor,
  createPdfGenerateProcessor
} from "./processors/report.processor.js";
import { createNotificationProcessor } from "./processors/notification.processor.js";
import type { ProcessorDependencies } from "./processors/processor-dependencies.js";
import { NotConfiguredNotificationDispatchService } from "./services/scan-services.js";
import { ContainerizedScannerExecutionService } from "./services/scan-execution/index.js";
import { LocalSourcePreparationService } from "./services/source-preparation/local-source-preparation.service.js";
import { LocalFindingsNormalizationService } from "./services/findings-normalization/local-findings-normalization.service.js";
import { LocalBuildExecutionService } from "./services/build/local-build-execution.service.js";
import { LocalAiValidationService } from "./services/ai-validation/index.js";
import { LocalRiskScoringService } from "./services/risk-scoring/local-risk-scoring.service.js";
import { LocalAuditReportGenerationService } from "./services/report-generation/index.js";
import { ScanPersistenceService } from "./persistence/scan-persistence.service.js";

export interface ScanWorkerApplication {
  queueRegistry: QueueRegistry;
  control: ScanControlService;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function createScanWorkerApplication(): ScanWorkerApplication {
  const workerId = getWorkerId();
  const redis = createRedisConnection("worker");
  const queueRegistry = new QueueRegistry();
  const heartbeat = new WorkerHeartbeatService(
    redis,
    workerId,
    Object.values(SCAN_QUEUE_NAMES)
  );
  const lifecycle = new PersistentScanLifecycleStore(redis);
  const workerRegistry = new WorkerRegistry(queueRegistry, redis, workerId, heartbeat, lifecycle);
  const stageCoordinator = new ScanStageCoordinator(redis);
  const scannerExecution = new ContainerizedScannerExecutionService();
  const persistence = new ScanPersistenceService();

  const dependencies: ProcessorDependencies = {
    queues: queueRegistry,
    lifecycle,
    stageCoordinator,
    persistence,
    sourcePreparation: new LocalSourcePreparationService(),
    buildExecution: new LocalBuildExecutionService(),
    scannerExecution,
    findingsNormalization: new LocalFindingsNormalizationService(),
    riskScoring: new LocalRiskScoringService(),
    aiValidation: new LocalAiValidationService(),
    reportGeneration: new LocalAuditReportGenerationService(),
    notifications: new NotConfiguredNotificationDispatchService()
  };

  return {
    queueRegistry,
    control: new ScanControlService(queueRegistry, redis),

    async start() {
      logger.info({ workerId }, "starting scan worker application");
      const staleTempWorkspaces = await scannerExecution.cleanupStaleTempWorkspaces();
      if (staleTempWorkspaces > 0) {
        logger.info({ staleTempWorkspaces }, "cleaned up stale scanner temp workspaces");
      }
      await queueRegistry.configureGlobalConcurrency();

      workerRegistry.register({
        queueName: SCAN_QUEUE_NAMES.scanOrchestrator,
        concurrency: env.CONCURRENCY_SCAN_ORCHESTRATOR,
        processor: createScanOrchestratorProcessor(dependencies)
      });

      workerRegistry.register({
        queueName: SCAN_QUEUE_NAMES.sourcePrepare,
        concurrency: env.CONCURRENCY_SOURCE_PREPARE,
        processor: createSourcePrepareProcessor(dependencies)
      });

      workerRegistry.register({
        queueName: SCAN_QUEUE_NAMES.buildCompile,
        concurrency: env.CONCURRENCY_BUILD_COMPILE,
        processor: createBuildProcessor(dependencies)
      });

      workerRegistry.register({
        queueName: SCAN_QUEUE_NAMES.analyzerSlither,
        concurrency: env.CONCURRENCY_SLITHER,
        processor: createAnalyzerProcessor(dependencies)
      });

      workerRegistry.register({
        queueName: SCAN_QUEUE_NAMES.analyzerMythril,
        concurrency: env.CONCURRENCY_MYTHRIL,
        processor: createAnalyzerProcessor(dependencies)
      });

      workerRegistry.register({
        queueName: SCAN_QUEUE_NAMES.analyzerSemgrep,
        concurrency: env.CONCURRENCY_SEMGREP,
        processor: createAnalyzerProcessor(dependencies)
      });

      workerRegistry.register({
        queueName: SCAN_QUEUE_NAMES.analyzerAderyn,
        concurrency: env.CONCURRENCY_ADERYN,
        processor: createAnalyzerProcessor(dependencies)
      });

      workerRegistry.register({
        queueName: SCAN_QUEUE_NAMES.analyzerFoundry,
        concurrency: env.CONCURRENCY_FOUNDRY,
        processor: createAnalyzerProcessor(dependencies)
      });

      workerRegistry.register({
        queueName: SCAN_QUEUE_NAMES.findingsNormalize,
        concurrency: env.CONCURRENCY_FINDINGS_NORMALIZE,
        processor: createFindingsNormalizeProcessor(dependencies)
      });

      workerRegistry.register({
        queueName: SCAN_QUEUE_NAMES.riskScore,
        concurrency: env.CONCURRENCY_RISK_SCORE,
        processor: createRiskScoreProcessor(dependencies)
      });

      workerRegistry.register({
        queueName: SCAN_QUEUE_NAMES.aiValidate,
        concurrency: env.CONCURRENCY_AI_VALIDATE,
        processor: createAiValidationProcessor(dependencies)
      });

      workerRegistry.register({
        queueName: SCAN_QUEUE_NAMES.aiReport,
        concurrency: env.CONCURRENCY_AI_REPORT,
        processor: createAiReportProcessor(dependencies)
      });

      workerRegistry.register({
        queueName: SCAN_QUEUE_NAMES.pdfGenerate,
        concurrency: env.CONCURRENCY_PDF_GENERATE,
        processor: createPdfGenerateProcessor(dependencies)
      });

      workerRegistry.register({
        queueName: SCAN_QUEUE_NAMES.notificationsDispatch,
        concurrency: env.CONCURRENCY_NOTIFICATIONS,
        processor: createNotificationProcessor(dependencies)
      });

      heartbeat.start();
      logger.info({ workerId }, "scan worker application started");
    },

    async stop() {
      logger.info({ workerId }, "stopping scan worker application");
      await heartbeat.stop();
      await workerRegistry.close();
      await queueRegistry.close();
      await prisma.$disconnect();
      await redis.quit();
      logger.info({ workerId }, "scan worker application stopped");
    }
  };
}
