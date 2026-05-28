import { createHmac } from "node:crypto";
import { env } from "../../config/environment.js";
import { MonitoringRepository } from "./monitoring.repository.js";
import { sha256 } from "./redaction.js";

export interface WebhookAlertPayload {
  id: string;
  organizationId: string;
  projectId: string;
  kind: string;
  severity: string;
  status: string;
  title: string;
  targetAddress: string;
  transactionHash?: string | null;
  blockNumber?: bigint | number | string | null;
  observedAt: Date | string;
  evidence?: Array<{ id: string }>;
}

export class WebhookDeliveryService {
  constructor(
    private readonly repository = new MonitoringRepository(),
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async deliverForAlerts(alerts: WebhookAlertPayload[]): Promise<void> {
    if (!env.MONITORING_WEBHOOKS_ENABLED || alerts.length === 0) return;
    for (const alert of alerts) {
      await this.deliverAlert(alert);
    }
  }

  private async deliverAlert(alert: WebhookAlertPayload) {
    const webhooks = await this.repository.activeWebhooks(alert.projectId, alert.organizationId);
    const limited = webhooks.slice(0, 5);
    for (const webhook of limited) {
      const payload = JSON.stringify(
        {
          alertId: alert.id,
          projectId: alert.projectId,
          kind: alert.kind,
          severity: alert.severity,
          status: alert.status,
          title: alert.title,
          targetAddress: alert.targetAddress,
          transactionHash: alert.transactionHash ?? null,
          blockNumber: alert.blockNumber?.toString() ?? null,
          observedAt: alert.observedAt instanceof Date ? alert.observedAt.toISOString() : alert.observedAt,
          evidenceIds: alert.evidence?.map((item) => item.id) ?? []
        },
        null,
        0
      );
      const signature = createHmac("sha256", webhook.signingSecret).update(payload).digest("hex");
      try {
        const response = await this.fetchImpl(webhook.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-web3guard-signature": `sha256=${signature}`
          },
          body: payload
        });
        await this.repository.createDelivery({
          alertId: alert.id,
          webhookId: webhook.id,
          organizationId: alert.organizationId,
          projectId: alert.projectId,
          status: response.ok ? "SUCCEEDED" : "FAILED",
          attempts: 1,
          payloadChecksumSha256: sha256(payload),
          responseStatus: response.status,
          errorCategory: response.ok ? null : "WEBHOOK_HTTP_ERROR",
          error: response.ok ? null : `Webhook endpoint returned HTTP ${response.status}`,
          deliveredAt: response.ok ? new Date() : null,
          nextAttemptAt: response.ok ? null : new Date(Date.now() + 60_000),
          metadata: { redactedUrl: webhook.redactedUrl }
        });
        if (response.ok) {
          await this.repository.touchWebhook(webhook.id);
        }
      } catch (cause) {
        await this.repository.createDelivery({
          alertId: alert.id,
          webhookId: webhook.id,
          organizationId: alert.organizationId,
          projectId: alert.projectId,
          status: "FAILED",
          attempts: 1,
          payloadChecksumSha256: sha256(payload),
          errorCategory: "WEBHOOK_DELIVERY_FAILED",
          error: cause instanceof Error ? cause.message : "Webhook delivery failed",
          nextAttemptAt: new Date(Date.now() + 60_000),
          metadata: { redactedUrl: webhook.redactedUrl }
        });
      }
    }
  }
}
