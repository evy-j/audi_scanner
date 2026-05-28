import {
  SCAN_QUEUE_NAMES,
  type NotificationJobData,
  type ReportJobData
} from "@audit-scanner/shared/queues/scan-jobs";
import { toBullPriority } from "../queues/priority.js";
import type { QueueProcessor } from "../queues/worker-registry.js";
import type { ProcessorDependencies } from "./processor-dependencies.js";

export function createAiReportProcessor(
  dependencies: ProcessorDependencies
): QueueProcessor<ReportJobData> {
  return async ({ job, progress, assertNotCancelled, signal }) => {
    await assertNotCancelled();

    await dependencies.lifecycle.transition({
      scanId: job.data.scanId,
      organizationId: job.data.organizationId,
      status: "REPORTING",
      progress: 90,
      message: "Generating AI audit report",
      traceId: job.data.traceId,
      correlationId: job.data.correlationId
    });

    await progress.publish(job, {
      type: "report.generating",
      status: "REPORTING",
      progress: 90,
      message: "Generating AI audit report"
    });

    const report = await dependencies.reportGeneration.generate(job.data, signal);

    await dependencies.queues.getQueue(SCAN_QUEUE_NAMES.pdfGenerate).add(
      "pdf.generate",
      {
        ...job.data,
        reportId: report.reportId,
        reportArtifactKey: report.reportArtifactKey,
        attemptContext: {
          parentJobId: job.id,
          submittedAt: new Date().toISOString()
        }
      },
      {
        jobId: `scan:${job.data.scanId}:pdf.generate`,
        priority: toBullPriority(job.data.priority)
      }
    );

    return report;
  };
}

export function createPdfGenerateProcessor(
  dependencies: ProcessorDependencies
): QueueProcessor<ReportJobData> {
  return async ({ job, progress, assertNotCancelled, signal }) => {
    await assertNotCancelled();

    if (!job.data.reportId || !job.data.reportArtifactKey) {
      throw new Error("PDF generation requires reportId and reportArtifactKey");
    }

    const report = {
      reportId: job.data.reportId,
      reportArtifactKey: job.data.reportArtifactKey
    };
    const pdf = await dependencies.reportGeneration.renderPdf(report, signal);
    const finalStatus: "PARTIAL" | "COMPLETED" = job.data.analysisPartial ? "PARTIAL" : "COMPLETED";
    const finalEventType: "scan.partial" | "scan.completed" = job.data.analysisPartial
      ? "scan.partial"
      : "scan.completed";
    const finalMessage = job.data.analysisPartial
      ? "Scan completed with partial analyzer coverage"
      : "Scan completed";

    await dependencies.lifecycle.transition({
      scanId: job.data.scanId,
      organizationId: job.data.organizationId,
      status: finalStatus,
      progress: 100,
      message: finalMessage,
      traceId: job.data.traceId,
      correlationId: job.data.correlationId,
      metadata: {
        reportId: report.reportId,
        pdfArtifactKey: pdf.pdfArtifactKey,
        analyzerFailures: job.data.analyzerFailures ?? {}
      }
    });

    await progress.publish(job, {
      type: finalEventType,
      status: finalStatus,
      progress: 100,
      message: finalMessage,
      data: {
        reportId: report.reportId,
        pdfArtifactKey: pdf.pdfArtifactKey,
        checksumSha256: pdf.checksumSha256,
        analyzerFailures: job.data.analyzerFailures ?? {}
      }
    });

    const notificationJob: NotificationJobData = {
      scanId: job.data.scanId,
      organizationId: job.data.organizationId,
      requestedByUserId: job.data.requestedByUserId,
      traceId: job.data.traceId,
      correlationId: job.data.correlationId,
      priority: job.data.priority,
      eventType: job.data.analysisPartial ? "SCAN_PARTIAL" : "SCAN_COMPLETED",
      payload: {
        reportId: report.reportId,
        pdfArtifactKey: pdf.pdfArtifactKey
      },
      attemptContext: {
        parentJobId: job.id,
        submittedAt: new Date().toISOString()
      }
    };

    await dependencies.queues
      .getQueue(SCAN_QUEUE_NAMES.notificationsDispatch)
      .add("notifications.dispatch", notificationJob, {
        jobId: `scan:${job.data.scanId}:notifications.completed`,
        priority: toBullPriority(job.data.priority)
      });

    return pdf;
  };
}
