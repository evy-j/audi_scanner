-- P2B AST/source-map analysis IR and finding-to-code enrichment.

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM (
  'EXTRACTED',
  'PARTIAL',
  'NOT_ASSESSED',
  'FAILED'
);

-- CreateTable
CREATE TABLE "analysis_ir_runs" (
  "id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "analyzer_run_id" UUID,
  "artifact_key" TEXT,
  "artifact_checksum" VARCHAR(128),
  "extraction_status" "ExtractionStatus" NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  "error" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "analysis_ir_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_symbols" (
  "id" UUID NOT NULL,
  "analysis_ir_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "analyzer_run_id" UUID,
  "artifact_key" TEXT,
  "file_path" TEXT,
  "start_line" INTEGER,
  "end_line" INTEGER,
  "start_column" INTEGER,
  "end_column" INTEGER,
  "start_offset" INTEGER,
  "source_length" INTEGER,
  "extraction_status" "ExtractionStatus" NOT NULL,
  "ast_id" INTEGER,
  "name" VARCHAR(160) NOT NULL,
  "kind" VARCHAR(80),
  "fully_qualified_name" VARCHAR(400) NOT NULL,
  "inheritance" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "contract_symbols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "function_symbols" (
  "id" UUID NOT NULL,
  "analysis_ir_run_id" UUID NOT NULL,
  "contract_symbol_id" UUID,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "analyzer_run_id" UUID,
  "artifact_key" TEXT,
  "file_path" TEXT,
  "start_line" INTEGER,
  "end_line" INTEGER,
  "start_column" INTEGER,
  "end_column" INTEGER,
  "start_offset" INTEGER,
  "source_length" INTEGER,
  "extraction_status" "ExtractionStatus" NOT NULL,
  "ast_id" INTEGER,
  "contract_name" VARCHAR(160) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "canonical_name" VARCHAR(320) NOT NULL,
  "kind" VARCHAR(80),
  "visibility" VARCHAR(40),
  "state_mutability" VARCHAR(40),
  "payable" BOOLEAN NOT NULL DEFAULT false,
  "selector" VARCHAR(16),
  "modifiers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "function_symbols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_symbols" (
  "id" UUID NOT NULL,
  "analysis_ir_run_id" UUID NOT NULL,
  "contract_symbol_id" UUID,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "analyzer_run_id" UUID,
  "artifact_key" TEXT,
  "file_path" TEXT,
  "start_line" INTEGER,
  "end_line" INTEGER,
  "start_column" INTEGER,
  "end_column" INTEGER,
  "start_offset" INTEGER,
  "source_length" INTEGER,
  "extraction_status" "ExtractionStatus" NOT NULL,
  "ast_id" INTEGER,
  "contract_name" VARCHAR(160) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "visibility" VARCHAR(40),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "modifier_symbols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state_variable_symbols" (
  "id" UUID NOT NULL,
  "analysis_ir_run_id" UUID NOT NULL,
  "contract_symbol_id" UUID,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "analyzer_run_id" UUID,
  "artifact_key" TEXT,
  "file_path" TEXT,
  "start_line" INTEGER,
  "end_line" INTEGER,
  "start_column" INTEGER,
  "end_column" INTEGER,
  "start_offset" INTEGER,
  "source_length" INTEGER,
  "extraction_status" "ExtractionStatus" NOT NULL,
  "ast_id" INTEGER,
  "contract_name" VARCHAR(160) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "type_name" TEXT,
  "visibility" VARCHAR(40),
  "constant" BOOLEAN NOT NULL DEFAULT false,
  "immutable" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "state_variable_symbols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_symbols" (
  "id" UUID NOT NULL,
  "analysis_ir_run_id" UUID NOT NULL,
  "contract_symbol_id" UUID,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "analyzer_run_id" UUID,
  "artifact_key" TEXT,
  "file_path" TEXT,
  "start_line" INTEGER,
  "end_line" INTEGER,
  "start_column" INTEGER,
  "end_column" INTEGER,
  "start_offset" INTEGER,
  "source_length" INTEGER,
  "extraction_status" "ExtractionStatus" NOT NULL,
  "ast_id" INTEGER,
  "contract_name" VARCHAR(160) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "anonymous" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "event_symbols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_graph_edges" (
  "id" UUID NOT NULL,
  "analysis_ir_run_id" UUID NOT NULL,
  "from_function_symbol_id" UUID,
  "to_function_symbol_id" UUID,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "analyzer_run_id" UUID,
  "artifact_key" TEXT,
  "file_path" TEXT,
  "start_line" INTEGER,
  "end_line" INTEGER,
  "start_column" INTEGER,
  "end_column" INTEGER,
  "start_offset" INTEGER,
  "source_length" INTEGER,
  "extraction_status" "ExtractionStatus" NOT NULL,
  "from_contract" VARCHAR(160) NOT NULL,
  "from_function" VARCHAR(160) NOT NULL,
  "to_contract" VARCHAR(160),
  "to_function" VARCHAR(160),
  "call_kind" VARCHAR(80) NOT NULL,
  "target_expression" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "call_graph_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_call_sites" (
  "id" UUID NOT NULL,
  "analysis_ir_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "analyzer_run_id" UUID,
  "artifact_key" TEXT,
  "file_path" TEXT,
  "start_line" INTEGER,
  "end_line" INTEGER,
  "start_column" INTEGER,
  "end_column" INTEGER,
  "start_offset" INTEGER,
  "source_length" INTEGER,
  "extraction_status" "ExtractionStatus" NOT NULL,
  "contract_name" VARCHAR(160) NOT NULL,
  "function_name" VARCHAR(160) NOT NULL,
  "call_kind" VARCHAR(80) NOT NULL,
  "target_expression" TEXT,
  "value_transfer" BOOLEAN NOT NULL DEFAULT false,
  "low_level" BOOLEAN NOT NULL DEFAULT false,
  "confidence" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "external_call_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_layout_entries" (
  "id" UUID NOT NULL,
  "analysis_ir_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "analyzer_run_id" UUID,
  "artifact_key" TEXT,
  "file_path" TEXT,
  "start_line" INTEGER,
  "end_line" INTEGER,
  "start_column" INTEGER,
  "end_column" INTEGER,
  "start_offset" INTEGER,
  "source_length" INTEGER,
  "extraction_status" "ExtractionStatus" NOT NULL,
  "contract_name" VARCHAR(160) NOT NULL,
  "ast_id" INTEGER,
  "label" VARCHAR(160) NOT NULL,
  "slot" VARCHAR(80) NOT NULL,
  "offset" INTEGER NOT NULL DEFAULT 0,
  "type_name" TEXT NOT NULL,
  "encoding" VARCHAR(80),
  "number_of_bytes" VARCHAR(80),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "storage_layout_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_map_entries" (
  "id" UUID NOT NULL,
  "analysis_ir_run_id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "analyzer_run_id" UUID,
  "artifact_key" TEXT,
  "file_path" TEXT,
  "start_line" INTEGER,
  "end_line" INTEGER,
  "start_column" INTEGER,
  "end_column" INTEGER,
  "start_offset" INTEGER,
  "source_length" INTEGER,
  "extraction_status" "ExtractionStatus" NOT NULL,
  "contract_name" VARCHAR(160) NOT NULL,
  "artifact" VARCHAR(80) NOT NULL,
  "instruction_index" INTEGER NOT NULL,
  "source_index" INTEGER,
  "offset" INTEGER,
  "jump" VARCHAR(20),
  "modifier_depth" INTEGER,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "source_map_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_code_links" (
  "id" UUID NOT NULL,
  "organization_id" UUID,
  "project_id" UUID,
  "scan_id" UUID NOT NULL,
  "finding_id" UUID NOT NULL,
  "analysis_ir_run_id" UUID,
  "contract_symbol_id" UUID,
  "function_symbol_id" UUID,
  "external_call_site_id" UUID,
  "storage_layout_entry_id" UUID,
  "file_path" TEXT,
  "start_line" INTEGER,
  "end_line" INTEGER,
  "start_column" INTEGER,
  "end_column" INTEGER,
  "extraction_status" "ExtractionStatus" NOT NULL,
  "link_type" VARCHAR(80) NOT NULL,
  "confidence" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "reason" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "finding_code_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analysis_ir_runs_scan_id_extraction_status_created_at_idx" ON "analysis_ir_runs"("scan_id", "extraction_status", "created_at");

-- CreateIndex
CREATE INDEX "analysis_ir_runs_organization_id_project_id_created_at_idx" ON "analysis_ir_runs"("organization_id", "project_id", "created_at");

-- CreateIndex
CREATE INDEX "contract_symbols_scan_id_name_idx" ON "contract_symbols"("scan_id", "name");

-- CreateIndex
CREATE INDEX "contract_symbols_analysis_ir_run_id_idx" ON "contract_symbols"("analysis_ir_run_id");

-- CreateIndex
CREATE INDEX "function_symbols_scan_id_contract_name_name_idx" ON "function_symbols"("scan_id", "contract_name", "name");

-- CreateIndex
CREATE INDEX "function_symbols_file_path_start_line_idx" ON "function_symbols"("file_path", "start_line");

-- CreateIndex
CREATE INDEX "modifier_symbols_scan_id_contract_name_name_idx" ON "modifier_symbols"("scan_id", "contract_name", "name");

-- CreateIndex
CREATE INDEX "state_variable_symbols_scan_id_contract_name_name_idx" ON "state_variable_symbols"("scan_id", "contract_name", "name");

-- CreateIndex
CREATE INDEX "event_symbols_scan_id_contract_name_name_idx" ON "event_symbols"("scan_id", "contract_name", "name");

-- CreateIndex
CREATE INDEX "call_graph_edges_scan_id_from_contract_from_function_idx" ON "call_graph_edges"("scan_id", "from_contract", "from_function");

-- CreateIndex
CREATE INDEX "call_graph_edges_scan_id_call_kind_idx" ON "call_graph_edges"("scan_id", "call_kind");

-- CreateIndex
CREATE INDEX "external_call_sites_scan_id_call_kind_idx" ON "external_call_sites"("scan_id", "call_kind");

-- CreateIndex
CREATE INDEX "external_call_sites_file_path_start_line_idx" ON "external_call_sites"("file_path", "start_line");

-- CreateIndex
CREATE INDEX "storage_layout_entries_scan_id_contract_name_label_idx" ON "storage_layout_entries"("scan_id", "contract_name", "label");

-- CreateIndex
CREATE INDEX "source_map_entries_scan_id_contract_name_instruction_index_idx" ON "source_map_entries"("scan_id", "contract_name", "instruction_index");

-- CreateIndex
CREATE INDEX "source_map_entries_file_path_start_line_idx" ON "source_map_entries"("file_path", "start_line");

-- CreateIndex
CREATE INDEX "finding_code_links_finding_id_link_type_idx" ON "finding_code_links"("finding_id", "link_type");

-- CreateIndex
CREATE INDEX "finding_code_links_scan_id_link_type_idx" ON "finding_code_links"("scan_id", "link_type");

-- AddForeignKey
ALTER TABLE "analysis_ir_runs" ADD CONSTRAINT "analysis_ir_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_ir_runs" ADD CONSTRAINT "analysis_ir_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_ir_runs" ADD CONSTRAINT "analysis_ir_runs_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_ir_runs" ADD CONSTRAINT "analysis_ir_runs_analyzer_run_id_fkey" FOREIGN KEY ("analyzer_run_id") REFERENCES "analyzer_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_symbols" ADD CONSTRAINT "contract_symbols_analysis_ir_run_id_fkey" FOREIGN KEY ("analysis_ir_run_id") REFERENCES "analysis_ir_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_symbols" ADD CONSTRAINT "contract_symbols_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_symbols" ADD CONSTRAINT "contract_symbols_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_symbols" ADD CONSTRAINT "contract_symbols_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_symbols" ADD CONSTRAINT "contract_symbols_analyzer_run_id_fkey" FOREIGN KEY ("analyzer_run_id") REFERENCES "analyzer_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "function_symbols" ADD CONSTRAINT "function_symbols_analysis_ir_run_id_fkey" FOREIGN KEY ("analysis_ir_run_id") REFERENCES "analysis_ir_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "function_symbols" ADD CONSTRAINT "function_symbols_contract_symbol_id_fkey" FOREIGN KEY ("contract_symbol_id") REFERENCES "contract_symbols"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "function_symbols" ADD CONSTRAINT "function_symbols_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "function_symbols" ADD CONSTRAINT "function_symbols_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "function_symbols" ADD CONSTRAINT "function_symbols_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "function_symbols" ADD CONSTRAINT "function_symbols_analyzer_run_id_fkey" FOREIGN KEY ("analyzer_run_id") REFERENCES "analyzer_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_symbols" ADD CONSTRAINT "modifier_symbols_analysis_ir_run_id_fkey" FOREIGN KEY ("analysis_ir_run_id") REFERENCES "analysis_ir_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_symbols" ADD CONSTRAINT "modifier_symbols_contract_symbol_id_fkey" FOREIGN KEY ("contract_symbol_id") REFERENCES "contract_symbols"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_symbols" ADD CONSTRAINT "modifier_symbols_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_symbols" ADD CONSTRAINT "modifier_symbols_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_symbols" ADD CONSTRAINT "modifier_symbols_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_symbols" ADD CONSTRAINT "modifier_symbols_analyzer_run_id_fkey" FOREIGN KEY ("analyzer_run_id") REFERENCES "analyzer_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "state_variable_symbols" ADD CONSTRAINT "state_variable_symbols_analysis_ir_run_id_fkey" FOREIGN KEY ("analysis_ir_run_id") REFERENCES "analysis_ir_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "state_variable_symbols" ADD CONSTRAINT "state_variable_symbols_contract_symbol_id_fkey" FOREIGN KEY ("contract_symbol_id") REFERENCES "contract_symbols"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "state_variable_symbols" ADD CONSTRAINT "state_variable_symbols_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "state_variable_symbols" ADD CONSTRAINT "state_variable_symbols_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "state_variable_symbols" ADD CONSTRAINT "state_variable_symbols_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "state_variable_symbols" ADD CONSTRAINT "state_variable_symbols_analyzer_run_id_fkey" FOREIGN KEY ("analyzer_run_id") REFERENCES "analyzer_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_symbols" ADD CONSTRAINT "event_symbols_analysis_ir_run_id_fkey" FOREIGN KEY ("analysis_ir_run_id") REFERENCES "analysis_ir_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_symbols" ADD CONSTRAINT "event_symbols_contract_symbol_id_fkey" FOREIGN KEY ("contract_symbol_id") REFERENCES "contract_symbols"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_symbols" ADD CONSTRAINT "event_symbols_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_symbols" ADD CONSTRAINT "event_symbols_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_symbols" ADD CONSTRAINT "event_symbols_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_symbols" ADD CONSTRAINT "event_symbols_analyzer_run_id_fkey" FOREIGN KEY ("analyzer_run_id") REFERENCES "analyzer_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_graph_edges" ADD CONSTRAINT "call_graph_edges_analysis_ir_run_id_fkey" FOREIGN KEY ("analysis_ir_run_id") REFERENCES "analysis_ir_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_graph_edges" ADD CONSTRAINT "call_graph_edges_from_function_symbol_id_fkey" FOREIGN KEY ("from_function_symbol_id") REFERENCES "function_symbols"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_graph_edges" ADD CONSTRAINT "call_graph_edges_to_function_symbol_id_fkey" FOREIGN KEY ("to_function_symbol_id") REFERENCES "function_symbols"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_graph_edges" ADD CONSTRAINT "call_graph_edges_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_graph_edges" ADD CONSTRAINT "call_graph_edges_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_graph_edges" ADD CONSTRAINT "call_graph_edges_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_graph_edges" ADD CONSTRAINT "call_graph_edges_analyzer_run_id_fkey" FOREIGN KEY ("analyzer_run_id") REFERENCES "analyzer_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_call_sites" ADD CONSTRAINT "external_call_sites_analysis_ir_run_id_fkey" FOREIGN KEY ("analysis_ir_run_id") REFERENCES "analysis_ir_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_call_sites" ADD CONSTRAINT "external_call_sites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_call_sites" ADD CONSTRAINT "external_call_sites_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_call_sites" ADD CONSTRAINT "external_call_sites_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_call_sites" ADD CONSTRAINT "external_call_sites_analyzer_run_id_fkey" FOREIGN KEY ("analyzer_run_id") REFERENCES "analyzer_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_layout_entries" ADD CONSTRAINT "storage_layout_entries_analysis_ir_run_id_fkey" FOREIGN KEY ("analysis_ir_run_id") REFERENCES "analysis_ir_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_layout_entries" ADD CONSTRAINT "storage_layout_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_layout_entries" ADD CONSTRAINT "storage_layout_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_layout_entries" ADD CONSTRAINT "storage_layout_entries_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_layout_entries" ADD CONSTRAINT "storage_layout_entries_analyzer_run_id_fkey" FOREIGN KEY ("analyzer_run_id") REFERENCES "analyzer_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_map_entries" ADD CONSTRAINT "source_map_entries_analysis_ir_run_id_fkey" FOREIGN KEY ("analysis_ir_run_id") REFERENCES "analysis_ir_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_map_entries" ADD CONSTRAINT "source_map_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_map_entries" ADD CONSTRAINT "source_map_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_map_entries" ADD CONSTRAINT "source_map_entries_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_map_entries" ADD CONSTRAINT "source_map_entries_analyzer_run_id_fkey" FOREIGN KEY ("analyzer_run_id") REFERENCES "analyzer_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_code_links" ADD CONSTRAINT "finding_code_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_code_links" ADD CONSTRAINT "finding_code_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_code_links" ADD CONSTRAINT "finding_code_links_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_code_links" ADD CONSTRAINT "finding_code_links_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_code_links" ADD CONSTRAINT "finding_code_links_analysis_ir_run_id_fkey" FOREIGN KEY ("analysis_ir_run_id") REFERENCES "analysis_ir_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_code_links" ADD CONSTRAINT "finding_code_links_contract_symbol_id_fkey" FOREIGN KEY ("contract_symbol_id") REFERENCES "contract_symbols"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_code_links" ADD CONSTRAINT "finding_code_links_function_symbol_id_fkey" FOREIGN KEY ("function_symbol_id") REFERENCES "function_symbols"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_code_links" ADD CONSTRAINT "finding_code_links_external_call_site_id_fkey" FOREIGN KEY ("external_call_site_id") REFERENCES "external_call_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_code_links" ADD CONSTRAINT "finding_code_links_storage_layout_entry_id_fkey" FOREIGN KEY ("storage_layout_entry_id") REFERENCES "storage_layout_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
