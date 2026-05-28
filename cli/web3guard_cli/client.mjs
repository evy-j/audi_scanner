import { requireBackendConfig } from "./config.mjs";

export class Web3GuardClient {
  constructor(config, fetchImpl = globalThis.fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async authStatus() {
    requireBackendConfig(this.config);
    return this.request("/integrations/github/status");
  }

  async scanSourceArtifact(input) {
    requireBackendConfig(this.config);
    if (!input?.sourceArtifactId && !this.config.sourceArtifactKey) {
      const error = new Error("WEB3GUARD_SOURCE_ARTIFACT_KEY is required for backend source scans from a local path");
      error.code = "SOURCE_ARTIFACT_REQUIRED";
      throw error;
    }
    return this.request("/scans", {
      method: "POST",
      body: JSON.stringify({
        organizationId: this.config.orgId,
        projectId: this.config.projectId || undefined,
        title: input.title,
        priority: "NORMAL",
        sourceArtifactId: input.sourceArtifactId,
        target: {
          type: "SOURCE",
          artifactKey: input.artifactKey ?? this.config.sourceArtifactKey
        },
        analyzers: ["slither", "mythril", "semgrep"]
      })
    });
  }

  async uploadSourceArtifact(input) {
    requireBackendConfig(this.config);
    return this.request("/source-artifacts/upload", {
      method: "POST",
      body: JSON.stringify({
        organizationId: this.config.orgId,
        projectId: this.config.projectId || undefined,
        ...input
      })
    });
  }

  async getScan(scanId) {
    requireBackendConfig(this.config);
    return this.request(`/scans/${scanId}?organizationId=${encodeURIComponent(this.config.orgId)}`);
  }

  async getScanFindings(scanId) {
    requireBackendConfig(this.config);
    return this.request(`/scans/${scanId}/findings?organizationId=${encodeURIComponent(this.config.orgId)}`);
  }

  async exportScanSarif(scanId) {
    requireBackendConfig(this.config);
    return this.request(`/scans/${scanId}/export/sarif?organizationId=${encodeURIComponent(this.config.orgId)}`);
  }

  async scanGitHubRepository(input) {
    requireBackendConfig(this.config);
    const repositories = await this.request(`/orgs/${this.config.orgId}/repositories`);
    const match = repositories.repositories?.find((repo) => repo.repoFullName === input.repo);
    if (!match) {
      const error = new Error("Repository is not connected to this organization");
      error.code = "REPOSITORY_NOT_CONNECTED";
      throw error;
    }
    return this.request(`/repositories/${match.id}/scan`, {
      method: "POST",
      body: JSON.stringify({
        organizationId: this.config.orgId,
        branch: input.branch,
        commitSha: input.commitSha,
        pullRequestNumber: input.pullRequestNumber,
        source: input.source ?? "CLI"
      })
    });
  }

  async request(path, init = {}) {
    if (!this.fetchImpl) {
      const error = new Error("fetch is not available in this runtime");
      error.code = "FETCH_NOT_AVAILABLE";
      throw error;
    }
    const response = await this.fetchImpl(`${this.config.apiUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.apiKey,
        ...(init.headers ?? {})
      }
    });
    if (!response.ok) {
      const text = await response.text();
      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }
      const providerCode = payload?.error?.code;
      const error = new Error(payload?.error?.message ?? (text || `Request failed with status ${response.status}`));
      error.code = response.status === 401 || response.status === 403
        ? "AUTH_ERROR"
        : ["ENTITLEMENT_DENIED", "LIMIT_EXCEEDED", "PAYMENT_REQUIRED", "SUBSCRIPTION_EXPIRED"].includes(providerCode)
          ? "POLICY_FAILURE"
          : "REQUEST_FAILED";
      error.providerCode = providerCode;
      error.details = payload?.error?.details;
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
}
