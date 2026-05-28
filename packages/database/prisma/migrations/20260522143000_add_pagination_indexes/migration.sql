CREATE INDEX "scans_org_deleted_created_id_idx"
  ON "scans"("organization_id", "deleted_at", "created_at", "id");

CREATE INDEX "scans_org_status_deleted_created_id_idx"
  ON "scans"("organization_id", "status", "deleted_at", "created_at", "id");

CREATE INDEX "vulns_scan_severity_created_id_idx"
  ON "vulnerabilities"("scan_id", "severity", "created_at", "id");

CREATE INDEX "vulns_severity_status_created_id_idx"
  ON "vulnerabilities"("severity", "status", "created_at", "id");

CREATE INDEX "audit_reports_org_deleted_created_id_idx"
  ON "audit_reports"("organization_id", "deleted_at", "created_at", "id");

CREATE INDEX "audit_reports_org_scan_status_deleted_created_id_idx"
  ON "audit_reports"("organization_id", "scan_id", "status", "deleted_at", "created_at", "id");
