import { z } from "zod";
import { organizationQuery } from "../../common/validation/common-schemas.js";

export const threatOrganizationQuery = organizationQuery;

const confidence = z.enum(["LOW", "MEDIUM", "HIGH", "VERIFIED", "DISPUTED"]);
const sourceType = z.enum([
  "INTERNAL_SCAN",
  "USER_FEEDBACK",
  "PUBLIC_REPORT",
  "INCIDENT_WRITEUP",
  "AUDIT_REPORT",
  "MONITORING_EVENT",
  "SIMULATION_ARTIFACT",
  "FUZZ_ARTIFACT",
  "MANUAL_REVIEW",
  "UNKNOWN"
]);
const signatureKind = z.enum([
  "REENTRANCY",
  "ACCESS_CONTROL",
  "ORACLE_MANIPULATION",
  "PROXY_UPGRADE",
  "STORAGE_COLLISION",
  "GOVERNANCE",
  "BRIDGE",
  "RUGPULL",
  "HONEYPOT",
  "DOS",
  "INTEGER_PRECISION",
  "UNCHECKED_CALL",
  "FRONT_RUNNING",
  "MEV",
  "LIQUIDITY_RISK",
  "UNKNOWN"
]);

const provenanceFields = {
  provenanceUrl: z.string().url().optional(),
  provenanceHash: z.string().min(8).max(128).optional(),
  provenanceReference: z.string().min(3).max(2000).optional()
};

export const threatIntelListQuery = organizationQuery.extend({
  projectId: z.string().uuid().optional(),
  scanId: z.string().uuid().optional(),
  findingId: z.string().uuid().optional(),
  sourceType: sourceType.optional(),
  confidence: confidence.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const createThreatIntelBody = z.object({
  projectId: z.string().uuid().optional(),
  scanId: z.string().uuid().optional(),
  findingId: z.string().uuid().optional(),
  alertId: z.string().uuid().optional(),
  sourceType,
  confidence: confidence.default("LOW"),
  title: z.string().min(3).max(240),
  summary: z.string().min(10).max(8000),
  reviewerNotes: z.string().max(8000).optional(),
  metadata: z.record(z.unknown()).optional(),
  ...provenanceFields,
  sources: z.array(z.object({
    sourceType,
    title: z.string().max(240).optional(),
    confidence: confidence.default("LOW"),
    artifactPath: z.string().max(2000).optional(),
    artifactChecksumSha256: z.string().min(8).max(128).optional(),
    metadata: z.record(z.unknown()).optional(),
    ...provenanceFields
  })).max(25).optional(),
  incidentReferences: z.array(z.object({
    sourceType,
    title: z.string().min(3).max(240),
    url: z.string().url().optional(),
    referenceHash: z.string().min(8).max(128).optional(),
    summary: z.string().min(10).max(4000),
    confidence: confidence.default("LOW"),
    metadata: z.record(z.unknown()).optional()
  })).max(25).optional()
});

export const threatSignatureListQuery = organizationQuery.extend({
  projectId: z.string().uuid().optional(),
  kind: signatureKind.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const createThreatSignatureBody = z.object({
  projectId: z.string().uuid().optional(),
  threatIntelEntryId: z.string().uuid().optional(),
  sourceId: z.string().uuid().optional(),
  kind: signatureKind,
  name: z.string().min(3).max(180),
  description: z.string().min(10).max(8000),
  defensiveSummary: z.string().min(10).max(4000),
  confidence: confidence.default("LOW"),
  affectedAnalyzers: z.array(z.string().min(1).max(80)).max(25).default([]),
  affectedRuleIds: z.array(z.string().min(1).max(160)).max(50).default([]),
  evidenceRequirements: z.array(z.string().min(1).max(240)).max(30).default([]),
  pattern: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  ...provenanceFields,
  conditions: z.array(z.object({
    conditionKey: z.string().min(1).max(160),
    conditionType: z.string().min(1).max(80),
    operator: z.string().min(1).max(40),
    expectedValue: z.unknown().optional(),
    evidenceType: z.string().max(80).optional(),
    required: z.boolean().default(true),
    metadata: z.record(z.unknown()).optional()
  })).max(50).optional()
});

export const threatSignatureParams = z.object({
  signatureId: z.string().uuid()
});

export const threatSignatureMatchParams = z.object({
  signatureId: z.string().uuid(),
  scanId: z.string().uuid()
});

export const scanThreatParams = z.object({
  scanId: z.string().uuid()
});

export const findingThreatParams = z.object({
  findingId: z.string().uuid()
});

export const detectorPrecisionQuery = organizationQuery.extend({
  projectId: z.string().uuid().optional(),
  scanId: z.string().uuid().optional(),
  analyzer: z.string().max(80).optional(),
  ruleId: z.string().max(160).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const falsePositiveFeedbackBody = z.object({
  reason: z.string().min(10).max(4000),
  evidenceIds: z.array(z.string().min(1).max(160)).max(50).default([]),
  signatureId: z.string().uuid().optional(),
  signatureMatchId: z.string().uuid().optional(),
  confidence: confidence.default("MEDIUM"),
  reviewerNotes: z.string().max(4000).optional()
});

const importThreatIntelEntry = createThreatIntelBody.extend({
  signatures: z.array(createThreatSignatureBody.omit({ threatIntelEntryId: true, sourceId: true })).max(25).optional(),
  walletLabels: z.array(z.object({
    projectId: z.string().uuid().optional(),
    chainId: z.number().int().positive().optional(),
    address: z.string().min(4).max(128),
    label: z.string().min(2).max(160),
    confidence,
    notes: z.string().max(2000).optional(),
    metadata: z.record(z.unknown()).optional(),
    ...provenanceFields
  })).max(50).optional(),
  contractLabels: z.array(z.object({
    projectId: z.string().uuid().optional(),
    chainId: z.number().int().positive().optional(),
    address: z.string().min(4).max(128),
    label: z.string().min(2).max(160),
    confidence,
    notes: z.string().max(2000).optional(),
    metadata: z.record(z.unknown()).optional(),
    ...provenanceFields
  })).max(50).optional()
});

export const threatIntelImportBody = z.object({
  importReference: z.string().min(3).max(240),
  entries: z.array(importThreatIntelEntry).min(1).max(100)
});
