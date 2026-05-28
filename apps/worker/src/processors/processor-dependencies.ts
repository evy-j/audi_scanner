import type { ScanLifecycleStore } from "../lifecycle/scan-lifecycle.service.js";
import type { QueueRegistry } from "../queues/queue-registry.js";
import type { ScanStageCoordinator } from "../queues/scan-stage-coordinator.js";
import type { ScanPersistenceService } from "../persistence/scan-persistence.service.js";
import type {
  FindingsNormalizationService,
  AiValidationService,
  BuildExecutionService,
  NotificationDispatchService,
  ReportGenerationService,
  RiskScoringService,
  ScannerExecutionService,
  SourcePreparationService
} from "../services/scan-services.js";

export interface ProcessorDependencies {
  queues: QueueRegistry;
  lifecycle: ScanLifecycleStore;
  stageCoordinator: ScanStageCoordinator;
  persistence: ScanPersistenceService;
  sourcePreparation: SourcePreparationService;
  buildExecution: BuildExecutionService;
  scannerExecution: ScannerExecutionService;
  findingsNormalization: FindingsNormalizationService;
  riskScoring: RiskScoringService;
  aiValidation: AiValidationService;
  reportGeneration: ReportGenerationService;
  notifications: NotificationDispatchService;
}
