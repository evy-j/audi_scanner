import type {
  ApiKeyRecord,
  AuditReport,
  AnalysisIrSummary,
  AiFindingValidationResponse,
  AiScanValidationSummary,
  AnalyzerToolAvailability,
  BaselineComparison,
  BillingCheckoutResponse,
  BillingPlansResponse,
  BillingStatus,
  BillingSubscriptionResponse,
  ChainRegistryResponse,
  ContractVerificationResponse,
  ExplorerFetchResponse,
  ExplorerScanResponse,
  BuildProfile,
  BuildRun,
  CallGraphEdge,
  CodeOwnerRule,
  CompilerArtifact,
  ContractSymbol,
  EvidenceSummary,
  ExternalCallSite,
  FindingCodeLink,
  FindingEvidence,
  FindingFuzzResponse,
  FindingReview,
  FindingReviewStatus,
  FindingSuppressionRule,
  FindingRemediationResponse,
  FindingSimulationResponse,
  CreatedApiKey,
  CreatedReportShareLink,
  DataRetentionPolicy,
  DetectorPrecisionResponse,
  EnterpriseAuditLogs,
  FunctionSymbol,
  GitHubAppStatus,
  GitHubInstallation,
  GitHubRepository,
  MonitorAlertsResponse,
  MonitorTargetsResponse,
  Organization,
  OrganizationMember,
  ProjectMember,
  ProjectWebhook,
  RepositoryScan,
  RepositoryScanBridgeResponse,
  RemediationRun,
  ReportExport,
  ReviewSummary,
  Scan,
  ScanRemediationSummary,
  ScanFuzzSummary,
  ScanInvariantResponse,
  ScanMonitoringSummary,
  ScanSimulationSummary,
  ScanThreatSummary,
  SecuritySetting,
  SourceArtifact,
  SourceManifest,
  SsoConnection,
  StorageLayoutEntry,
  TestRun,
  UsageSummary,
  Vulnerability
} from "@/types/api";
import { ApiClientError, safeErrorMessage, type ApiErrorPayload } from "./error-messages";

export type { Organization, Scan } from "@/types/api";

export interface WorkspaceConfig {
  apiBaseUrl: string;
  realtimeWsUrl: string;
  accessToken: string;
  organizationId: string;
}

export const defaultApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

export const defaultRealtimeWsUrl =
  process.env.NEXT_PUBLIC_REALTIME_WS_URL ?? "ws://localhost:4000/api/v1/realtime";

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user?: { id: string; email?: string; displayName?: string | null };
}

export interface SimpleWebsiteScanResponse {
  status: "completed" | "failed";
  targetUrl: string;
  scannedAt: string;
  summary: { score: number; passed: number; warnings: number; failed: number };
  checks: Array<{ id: string; title: string; status: "pass" | "warn" | "fail" | "not_assessed"; evidence: string; remediation?: string }>;
  response?: { status: number; finalUrl: string; headers: Record<string, string> };
  tls?: { assessed: boolean; protocol?: string; validTo?: string; issuer?: string; subject?: string; error?: string };
  realityNotes: string[];
}

export interface SimpleScanQueuedResponse {
  status: "QUEUED" | "STORED" | "REJECTED" | "FAILED";
  scan?: Scan;
  sourceArtifact?: SourceArtifact;
  artifact?: SourceArtifact;
  manifest?: unknown;
  runId?: string;
  message?: string;
  realityNotes?: string[];
}

export class AuditScannerApiClient {
  constructor(private readonly config: WorkspaceConfig) {}

  login(input: { email: string; password: string }): Promise<AuthSession> {
    return this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  signup(input: { email: string; password: string; displayName?: string }): Promise<{ userId: string; email: string; status: string; emailVerificationRequired: boolean }> {
    return this.request("/auth/signup", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  logout(refreshToken?: string): Promise<{ ok: true }> {
    return this.request("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ ...(refreshToken ? { refreshToken } : {}) })
    });
  }

  getMe(): Promise<{ id: string; email: string; displayName?: string | null; status: string }> {
    return this.request("/auth/me");
  }

  listOrganizations(): Promise<Organization[]> {
    return this.request("/organizations");
  }

  createOrganization(input: { name: string; slug: string; billingEmail?: string }): Promise<Organization> {
    return this.request("/organizations", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  startSimpleSourceUploadScan(input: {
    title: string;
    projectId?: string;
    analyzers: Array<"slither" | "mythril" | "semgrep" | "aderyn" | "foundry">;
    files: Array<{ path: string; contentBase64: string; checksum?: string }>;
    repoFullName?: string;
    branch?: string;
    commitSha?: string;
    sourceLabel?: string;
  }): Promise<SimpleScanQueuedResponse> {
    return this.request("/simple-scans/source-upload", {
      method: "POST",
      body: JSON.stringify({ organizationId: this.config.organizationId, priority: "NORMAL", ...input })
    });
  }

  startSimplePublicRepositoryScan(input: {
    title: string;
    repositoryUrl: string;
    branch?: string;
    projectId?: string;
    analyzers: Array<"slither" | "mythril" | "semgrep" | "aderyn" | "foundry">;
  }): Promise<SimpleScanQueuedResponse> {
    return this.request("/simple-scans/public-repository", {
      method: "POST",
      body: JSON.stringify({ organizationId: this.config.organizationId, priority: "NORMAL", ...input })
    });
  }

  passiveWebsiteScan(input: { url: string }): Promise<SimpleWebsiteScanResponse> {
    return this.request("/simple-scans/website-passive", {
      method: "POST",
      body: JSON.stringify({ organizationId: this.config.organizationId, ...input })
    });
  }

  listScans(limit = 20): Promise<Scan[]> {
    return this.request(`/scans?organizationId=${this.config.organizationId}&limit=${limit}`);
  }

  getScan(scanId: string): Promise<Scan> {
    return this.request(`/scans/${scanId}?organizationId=${this.config.organizationId}`);
  }

  listScanFindings(scanId: string, limit = 100): Promise<Vulnerability[]> {
    return this.request(`/scans/${scanId}/findings?organizationId=${this.config.organizationId}&limit=${limit}`);
  }

  getEvidenceSummary(scanId: string): Promise<EvidenceSummary> {
    return this.request(`/scans/${scanId}/evidence-summary?organizationId=${this.config.organizationId}`);
  }

  getIrSummary(scanId: string): Promise<AnalysisIrSummary> {
    return this.request(`/scans/${scanId}/ir-summary?organizationId=${this.config.organizationId}`);
  }

  getBuildProfile(scanId: string): Promise<BuildProfile | null> {
    return this.request(`/scans/${scanId}/build-profile?organizationId=${this.config.organizationId}`);
  }

  listBuildRuns(scanId: string): Promise<BuildRun[]> {
    return this.request(`/scans/${scanId}/build-runs?organizationId=${this.config.organizationId}`);
  }

  listCompilerArtifacts(scanId: string): Promise<CompilerArtifact[]> {
    return this.request(`/scans/${scanId}/compiler-artifacts?organizationId=${this.config.organizationId}`);
  }

  listTestRuns(scanId: string): Promise<TestRun[]> {
    return this.request(`/scans/${scanId}/test-runs?organizationId=${this.config.organizationId}`);
  }

  listToolAvailability(scanId: string): Promise<AnalyzerToolAvailability[]> {
    return this.request(`/scans/${scanId}/tool-availability?organizationId=${this.config.organizationId}`);
  }

  getAiValidationSummary(scanId: string): Promise<AiScanValidationSummary> {
    return this.request(`/scans/${scanId}/ai-validation-summary?organizationId=${this.config.organizationId}`);
  }

  getRemediationSummary(scanId: string): Promise<ScanRemediationSummary> {
    return this.request(`/scans/${scanId}/remediation-summary?organizationId=${this.config.organizationId}`);
  }

  getSimulationSummary(scanId: string): Promise<ScanSimulationSummary> {
    return this.request(`/scans/${scanId}/simulation-summary?organizationId=${this.config.organizationId}`);
  }

  getFuzzSummary(scanId: string): Promise<ScanFuzzSummary> {
    return this.request(`/scans/${scanId}/fuzz-summary?organizationId=${this.config.organizationId}`);
  }

  getScanInvariants(scanId: string): Promise<ScanInvariantResponse> {
    return this.request(`/scans/${scanId}/invariants?organizationId=${this.config.organizationId}`);
  }

  listScanReports(scanId: string): Promise<AuditReport[]> {
    return this.request(`/scans/${scanId}/reports?organizationId=${this.config.organizationId}`);
  }

  generateScanReport(scanId: string): Promise<AuditReport> {
    return this.request(`/scans/${scanId}/reports/generate?organizationId=${this.config.organizationId}`, {
      method: "POST"
    });
  }

  validateScanWithAi(scanId: string): Promise<unknown> {
    return this.request(`/scans/${scanId}/ai-validate?organizationId=${this.config.organizationId}`, {
      method: "POST"
    });
  }

  listContracts(scanId: string): Promise<ContractSymbol[]> {
    return this.request(`/scans/${scanId}/contracts?organizationId=${this.config.organizationId}`);
  }

  listContractFunctions(scanId: string, contractId: string): Promise<FunctionSymbol[]> {
    return this.request(`/scans/${scanId}/contracts/${contractId}/functions?organizationId=${this.config.organizationId}`);
  }

  getCallGraph(scanId: string): Promise<CallGraphEdge[]> {
    return this.request(`/scans/${scanId}/call-graph?organizationId=${this.config.organizationId}`);
  }

  listExternalCalls(scanId: string): Promise<ExternalCallSite[]> {
    return this.request(`/scans/${scanId}/external-calls?organizationId=${this.config.organizationId}`);
  }

  listStorageLayout(scanId: string): Promise<StorageLayoutEntry[]> {
    return this.request(`/scans/${scanId}/storage-layout?organizationId=${this.config.organizationId}`);
  }

  getFinding(findingId: string): Promise<Vulnerability> {
    return this.request(`/findings/${findingId}?organizationId=${this.config.organizationId}`);
  }

  getFindingEvidence(findingId: string): Promise<FindingEvidence[]> {
    return this.request(`/findings/${findingId}/evidence?organizationId=${this.config.organizationId}`);
  }

  getFindingCodeLinks(findingId: string): Promise<FindingCodeLink[]> {
    return this.request(`/findings/${findingId}/code-links?organizationId=${this.config.organizationId}`);
  }

  getFindingAiValidation(findingId: string): Promise<AiFindingValidationResponse> {
    return this.request(`/findings/${findingId}/ai-validation?organizationId=${this.config.organizationId}`);
  }

  getFindingRemediation(findingId: string): Promise<FindingRemediationResponse> {
    return this.request(`/findings/${findingId}/remediation?organizationId=${this.config.organizationId}`);
  }

  getFindingSimulations(findingId: string): Promise<FindingSimulationResponse> {
    return this.request(`/findings/${findingId}/simulations?organizationId=${this.config.organizationId}`);
  }

  getFindingFuzz(findingId: string): Promise<FindingFuzzResponse> {
    return this.request(`/findings/${findingId}/fuzz?organizationId=${this.config.organizationId}`);
  }

  validateFindingWithAi(findingId: string): Promise<unknown> {
    return this.request(`/findings/${findingId}/ai-validate?organizationId=${this.config.organizationId}`, {
      method: "POST"
    });
  }

  remediateFinding(findingId: string): Promise<unknown> {
    return this.request(`/findings/${findingId}/remediate?organizationId=${this.config.organizationId}`, {
      method: "POST"
    });
  }

  simulateFinding(findingId: string): Promise<unknown> {
    return this.request(`/findings/${findingId}/simulate?organizationId=${this.config.organizationId}`, {
      method: "POST"
    });
  }

  fuzzFinding(findingId: string): Promise<unknown> {
    return this.request(`/findings/${findingId}/fuzz?organizationId=${this.config.organizationId}`, {
      method: "POST"
    });
  }

  fuzzScan(scanId: string): Promise<unknown> {
    return this.request(`/scans/${scanId}/fuzz?organizationId=${this.config.organizationId}`, {
      method: "POST"
    });
  }

  runScanInvariants(scanId: string): Promise<unknown> {
    return this.request(`/scans/${scanId}/invariants/run?organizationId=${this.config.organizationId}`, {
      method: "POST"
    });
  }

  getMonitoringSummary(scanId: string): Promise<ScanMonitoringSummary> {
    return this.request(`/scans/${scanId}/monitoring-summary?organizationId=${this.config.organizationId}`);
  }

  getThreatSummary(scanId: string): Promise<ScanThreatSummary> {
    return this.request(`/scans/${scanId}/threat-summary?organizationId=${this.config.organizationId}`);
  }

  listDetectorPrecision(limit = 50): Promise<DetectorPrecisionResponse> {
    return this.request(`/detectors/precision?organizationId=${this.config.organizationId}&limit=${limit}`);
  }

  createFalsePositiveFeedback(findingId: string, input: {
    reason: string;
    evidenceIds?: string[];
    signatureId?: string;
    signatureMatchId?: string;
    confidence?: string;
    reviewerNotes?: string;
  }): Promise<unknown> {
    return this.request(`/findings/${findingId}/false-positive-feedback?organizationId=${this.config.organizationId}`, {
      method: "POST",
      body: JSON.stringify({
        confidence: "MEDIUM",
        evidenceIds: [],
        ...input
      })
    });
  }

  listMonitorTargets(projectId: string): Promise<MonitorTargetsResponse> {
    return this.request(`/projects/${projectId}/monitor-targets?organizationId=${this.config.organizationId}`);
  }

  listProjectAlerts(projectId: string): Promise<MonitorAlertsResponse> {
    return this.request(`/projects/${projectId}/alerts?organizationId=${this.config.organizationId}&limit=50`);
  }

  runMonitorOnce(projectId: string): Promise<unknown> {
    return this.request(`/projects/${projectId}/monitor/run-once?organizationId=${this.config.organizationId}`, {
      method: "POST"
    });
  }

  listProjectWebhooks(projectId: string): Promise<{ webhooks: ProjectWebhook[] }> {
    return this.request(`/projects/${projectId}/webhooks?organizationId=${this.config.organizationId}`);
  }

  createScan(input: {
    title?: string;
    priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
    target: {
      type: "ADDRESS" | "SOURCE" | "REPOSITORY" | "BYTECODE";
      chainId?: string;
      address?: string;
      repositoryUrl?: string;
      artifactKey?: string;
    };
    analyzers: Array<"slither" | "mythril" | "semgrep" | "aderyn" | "foundry">;
    projectId?: string;
    sourceArtifactId?: string;
  }): Promise<Scan> {
    return this.request("/scans", {
      method: "POST",
      body: JSON.stringify({
        organizationId: this.config.organizationId,
        ...input
      })
    });
  }

  cancelScan(scanId: string): Promise<Scan> {
    return this.request(`/scans/${scanId}/cancel?organizationId=${this.config.organizationId}`, {
      method: "POST"
    });
  }

  listVulnerabilities(input: { limit?: number; scanId?: string } = {}): Promise<Vulnerability[]> {
    const params = new URLSearchParams({
      organizationId: this.config.organizationId,
      limit: String(input.limit ?? 100)
    });
    if (input.scanId) {
      params.set("scanId", input.scanId);
    }
    return this.request(`/vulnerabilities?${params.toString()}`);
  }

  listReports(limit = 20): Promise<AuditReport[]> {
    return this.request(`/reports?organizationId=${this.config.organizationId}&limit=${limit}`);
  }

  getReport(reportId: string): Promise<AuditReport> {
    return this.request(`/reports/${reportId}?organizationId=${this.config.organizationId}`);
  }

  exportReport(reportId: string, format: "HTML" | "PDF" | "JSON" | "SARIF" | "MARKDOWN"): Promise<ReportExport> {
    return this.request(`/reports/${reportId}/export?organizationId=${this.config.organizationId}`, {
      method: "POST",
      body: JSON.stringify({ format })
    });
  }

  shareReport(reportId: string): Promise<CreatedReportShareLink> {
    return this.request(`/reports/${reportId}/share?organizationId=${this.config.organizationId}`, {
      method: "POST",
      body: JSON.stringify({})
    });
  }

  revokeReportShare(reportId: string): Promise<{ ok: true; revokedCount: number }> {
    return this.request(`/reports/${reportId}/revoke-share?organizationId=${this.config.organizationId}`, {
      method: "POST"
    });
  }

  getReviewSummary(scanId: string): Promise<ReviewSummary> {
    return this.request(`/scans/${scanId}/review-summary?organizationId=${this.config.organizationId}`);
  }

  getBaselineComparison(scanId: string, baseScanId?: string): Promise<BaselineComparison> {
    const params = new URLSearchParams({ organizationId: this.config.organizationId });
    if (baseScanId) params.set("baseScanId", baseScanId);
    return this.request(`/scans/${scanId}/baseline-comparison?${params.toString()}`);
  }

  getFindingReview(findingId: string): Promise<{ findingId: string; review: FindingReview | null; effectiveStatus: FindingReviewStatus }> {
    return this.request(`/findings/${findingId}/review?organizationId=${this.config.organizationId}`);
  }

  updateFindingReviewStatus(
    findingId: string,
    input: { status: FindingReviewStatus; reason?: string }
  ): Promise<FindingReview> {
    return this.request(`/findings/${findingId}/review/status?organizationId=${this.config.organizationId}`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  addFindingComment(findingId: string, body: string): Promise<unknown> {
    return this.request(`/findings/${findingId}/comments?organizationId=${this.config.organizationId}`, {
      method: "POST",
      body: JSON.stringify({ body })
    });
  }

  assignFinding(
    findingId: string,
    input: { assigneeName?: string; assigneeEmail?: string; assigneeTeam?: string; reason?: string }
  ): Promise<FindingReview> {
    return this.request(`/findings/${findingId}/assign?organizationId=${this.config.organizationId}`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  suppressFinding(findingId: string, reason: string): Promise<FindingReview> {
    return this.request(`/findings/${findingId}/suppress?organizationId=${this.config.organizationId}`, {
      method: "POST",
      body: JSON.stringify({ reason })
    });
  }

  unsuppressFinding(findingId: string, reason?: string): Promise<FindingReview> {
    return this.request(`/findings/${findingId}/unsuppress?organizationId=${this.config.organizationId}`, {
      method: "POST",
      body: JSON.stringify({ reason })
    });
  }

  reviewRemediation(remediationId: string, comment?: string): Promise<unknown> {
    return this.request(`/remediations/${remediationId}/review?organizationId=${this.config.organizationId}`, {
      method: "POST",
      body: JSON.stringify({ ...(comment ? { comment } : {}) })
    });
  }

  markRemediationReviewed(remediationId: string, comment?: string): Promise<RemediationRun> {
    return this.request(`/remediations/${remediationId}/mark-reviewed?organizationId=${this.config.organizationId}`, {
      method: "POST",
      body: JSON.stringify({ ...(comment ? { comment } : {}) })
    });
  }

  rejectRemediation(remediationId: string, reason?: string): Promise<RemediationRun> {
    return this.request(`/remediations/${remediationId}/reject?organizationId=${this.config.organizationId}`, {
      method: "POST",
      body: JSON.stringify({ ...(reason ? { reason } : {}) })
    });
  }

  listSuppressionRules(projectId: string): Promise<FindingSuppressionRule[]> {
    return this.request(`/projects/${projectId}/suppression-rules?organizationId=${this.config.organizationId}`);
  }

  listCodeOwners(projectId: string): Promise<CodeOwnerRule[]> {
    return this.request(`/projects/${projectId}/codeowners?organizationId=${this.config.organizationId}`);
  }

  exportSarif(scanId: string, includeSuppressed = false): Promise<unknown> {
    return this.request(
      `/scans/${scanId}/export/sarif?organizationId=${this.config.organizationId}&includeSuppressed=${includeSuppressed}`
    );
  }

  getOrganization(): Promise<Organization> {
    return this.request(`/organizations/${this.config.organizationId}`);
  }

  getUsageSummary(): Promise<UsageSummary> {
    return this.request(`/organizations/${this.config.organizationId}/usage`);
  }

  getBillingStatus(): Promise<BillingStatus> {
    return this.request("/billing/status");
  }



  listChains(): Promise<ChainRegistryResponse> {
    return this.request(`/chains?organizationId=${this.config.organizationId}`);
  }

  getChain(chainId: string): Promise<ChainRegistryResponse["chains"][number]> {
    return this.request(`/chains/${chainId}?organizationId=${this.config.organizationId}`);
  }

  validateChainAddress(chainId: string, address: string): Promise<{ valid: boolean; normalizedAddress: string | null; reason: string }> {
    return this.request(`/chains/${chainId}/address/validate?organizationId=${this.config.organizationId}&address=${encodeURIComponent(address)}`);
  }

  getContractVerification(chainId: string, address: string): Promise<ContractVerificationResponse> {
    return this.request(`/chains/${chainId}/contracts/${encodeURIComponent(address)}/verification?organizationId=${this.config.organizationId}`);
  }

  fetchContractSourceFromExplorer(chainId: string, address: string, input: { projectId?: string; includeAbi?: boolean; createSourceArtifact?: boolean } = {}): Promise<ExplorerFetchResponse> {
    return this.request(`/chains/${chainId}/contracts/${encodeURIComponent(address)}/fetch-source`, {
      method: "POST",
      body: JSON.stringify({ organizationId: this.config.organizationId, includeAbi: true, createSourceArtifact: true, ...input })
    });
  }

  scanVerifiedContractFromExplorer(chainId: string, address: string, input: { projectId?: string; title?: string; priority?: "LOW" | "NORMAL" | "HIGH" | "CRITICAL" } = {}): Promise<ExplorerScanResponse> {
    return this.request(`/chains/${chainId}/contracts/${encodeURIComponent(address)}/scan`, {
      method: "POST",
      body: JSON.stringify({ organizationId: this.config.organizationId, fetchIfMissing: true, priority: "NORMAL", ...input })
    });
  }

  listBillingPlans(): Promise<BillingPlansResponse> {
    return this.request("/billing/plans");
  }

  getBillingSubscription(): Promise<BillingSubscriptionResponse> {
    return this.request(`/orgs/${this.config.organizationId}/billing/subscription`);
  }

  getBillingUsage(): Promise<UsageSummary & { usageMeters?: Array<Record<string, unknown>>; recentEvents?: Array<Record<string, unknown>> }> {
    return this.request(`/orgs/${this.config.organizationId}/billing/usage`);
  }

  createBillingCheckout(input: { planId?: string; priceId?: string }): Promise<BillingCheckoutResponse> {
    return this.request(`/orgs/${this.config.organizationId}/billing/checkout`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  cancelBillingSubscription(): Promise<unknown> {
    return this.request(`/orgs/${this.config.organizationId}/billing/cancel`, {
      method: "POST"
    });
  }

  listBillingInvoices(): Promise<{ invoices: Array<Record<string, unknown>> }> {
    return this.request(`/orgs/${this.config.organizationId}/billing/invoices`);
  }

  listBillingPayments(): Promise<{ payments: Array<Record<string, unknown>> }> {
    return this.request(`/orgs/${this.config.organizationId}/billing/payments`);
  }

  updateOrganization(input: Partial<Pick<Organization, "name" | "billingEmail" | "status">>): Promise<Organization> {
    return this.request(`/organizations/${this.config.organizationId}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  }

  listApiKeys(): Promise<ApiKeyRecord[]> {
    return this.request(`/organizations/${this.config.organizationId}/api-keys`);
  }

  createApiKey(input: { name: string; scopes: string[]; expiresAt?: string; projectId?: string; githubRepositoryId?: string }): Promise<CreatedApiKey> {
    return this.request(`/organizations/${this.config.organizationId}/api-keys`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  revokeApiKey(apiKeyId: string): Promise<{ ok: true }> {
    return this.request(`/organizations/${this.config.organizationId}/api-keys/${apiKeyId}`, {
      method: "DELETE"
    });
  }

  listOrganizationMembers(): Promise<OrganizationMember[]> {
    return this.request(`/orgs/${this.config.organizationId}/members`);
  }

  inviteOrganizationMember(input: { email: string; roleType: string; title?: string }): Promise<{ member: OrganizationMember; emailSent: boolean }> {
    return this.request(`/orgs/${this.config.organizationId}/members/invite`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  listProjectMembers(projectId: string): Promise<ProjectMember[]> {
    return this.request(`/projects/${projectId}/members?organizationId=${this.config.organizationId}`);
  }

  getAuditLogs(): Promise<EnterpriseAuditLogs> {
    return this.request(`/orgs/${this.config.organizationId}/audit-logs?limit=50`);
  }

  getSso(): Promise<SsoConnection> {
    return this.request(`/orgs/${this.config.organizationId}/sso`);
  }

  updateSso(input: Partial<SsoConnection> & { clientSecret?: string }): Promise<SsoConnection> {
    return this.request(`/orgs/${this.config.organizationId}/sso`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  }

  getDataRetention(): Promise<DataRetentionPolicy> {
    return this.request(`/orgs/${this.config.organizationId}/data-retention`);
  }

  updateDataRetention(input: Partial<Pick<DataRetentionPolicy, "scanArtifactRetentionDays" | "reportRetentionDays" | "auditLogRetentionDays">>): Promise<DataRetentionPolicy> {
    return this.request(`/orgs/${this.config.organizationId}/data-retention`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  }

  createDataExportRequest(input: { projectId?: string; scope?: string; reason?: string }): Promise<unknown> {
    return this.request(`/orgs/${this.config.organizationId}/data-export-requests`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  createDataDeletionRequest(input: { projectId?: string; scope?: string; reason: string }): Promise<unknown> {
    return this.request(`/orgs/${this.config.organizationId}/data-deletion-requests`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  getSecuritySettings(): Promise<SecuritySetting> {
    return this.request(`/orgs/${this.config.organizationId}/security-settings`);
  }

  updateSecuritySettings(input: Partial<SecuritySetting>): Promise<SecuritySetting> {
    return this.request(`/orgs/${this.config.organizationId}/security-settings`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  }

  getGitHubStatus(): Promise<GitHubAppStatus> {
    return this.request("/integrations/github/status");
  }

  listGitHubInstallations(): Promise<{ github: GitHubAppStatus; installations: GitHubInstallation[] }> {
    return this.request(`/orgs/${this.config.organizationId}/integrations/github/installations`);
  }

  listRepositories(): Promise<{ repositories: GitHubRepository[] }> {
    return this.request(`/orgs/${this.config.organizationId}/repositories`);
  }

  ingestRepository(repoId: string, input: { branch?: string; commitSha?: string; pullRequestNumber?: number } = {}): Promise<RepositoryScanBridgeResponse> {
    return this.request(`/repositories/${repoId}/ingest`, {
      method: "POST",
      body: JSON.stringify({ organizationId: this.config.organizationId, ...input })
    });
  }

  scanRepository(repoId: string, input: { branch?: string; commitSha?: string; pullRequestNumber?: number } = {}): Promise<RepositoryScanBridgeResponse> {
    return this.request(`/repositories/${repoId}/scan`, {
      method: "POST",
      body: JSON.stringify({ organizationId: this.config.organizationId, source: "GITHUB_APP", ...input })
    });
  }

  listRepositoryScans(repoId: string): Promise<{ scans: RepositoryScan[] }> {
    return this.request(`/orgs/${this.config.organizationId}/repositories/${repoId}/scans`);
  }

  getSourceArtifact(artifactId: string): Promise<SourceArtifact> {
    return this.request(`/source-artifacts/${artifactId}`);
  }

  getSourceManifest(artifactId: string): Promise<SourceManifest> {
    return this.request(`/source-artifacts/${artifactId}/manifest`);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(init.headers as Record<string, string> | undefined)
    };

    if (this.config.accessToken) {
      headers.authorization = this.config.accessToken.toLowerCase().startsWith("bearer ")
        ? this.config.accessToken
        : `Bearer ${this.config.accessToken}`;
    }

    const response = await fetch(`${this.config.apiBaseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store"
    });

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;
      let code = "REQUEST_FAILED";
      try {
        const payload = (await response.json()) as ApiErrorPayload;
        code = payload.error?.code ?? code;
        message = safeErrorMessage({
          status: response.status,
          code,
          message: payload.error?.message ?? message,
          details: payload.error?.details
        });
      } catch {
        message = safeErrorMessage({ status: response.status, code, message });
      }
      throw new ApiClientError(code, message, response.status);
    }

    return (await response.json()) as T;
  }
}

export function hasWorkspaceConfig(config: WorkspaceConfig): boolean {
  return Boolean(config.apiBaseUrl && config.realtimeWsUrl && config.accessToken && config.organizationId);
}
