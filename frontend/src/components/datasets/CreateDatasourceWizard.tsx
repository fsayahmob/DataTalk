"use client";

import { useState, useEffect, useCallback } from "react";
import Form from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import type { RJSFSchema, UiSchema } from "@rjsf/utils";
import { toast } from "sonner";
import {
  DatabaseIcon,
  SearchIcon,
  CloseIcon,
  CheckIcon,
  ArrowLeftIcon,
  ChevronRightIcon,
  CloudIcon,
  ShoppingCartIcon,
  UsersIcon,
  BarChartIcon,
  FileIcon,
  DollarIcon,
  GridIcon,
  ServerIcon,
  FolderIcon,
  GlobeIcon,
} from "@/components/icons";
import { useTranslation } from "@/hooks/useTranslation";
import { useConnectorStore } from "@/stores/useConnectorStore";
import { useDatasourceStore } from "@/stores/useDatasourceStore";
import { TableSelector } from "./TableSelector";
import { FKWarningDialog, findMissingFKTables } from "./FKWarningDialog";
import { SyncModeSelector } from "./SyncModeSelector";
import { Checkbox } from "@/components/ui/checkbox";
import * as api from "@/lib/api";
import type {
  Connector,
  DiscoveredTable,
  SyncMode,
  IngestionCatalog,
} from "@/lib/api";

// ============================================================================
// TYPES
// ============================================================================

interface CreateDatasourceWizardProps {
  isOpen: boolean;
  datasetId: string;
  onClose: () => void;
  onCreated: () => void;
}

type WizardStep = "select" | "configure" | "tables" | "mode" | "finalize";

// ============================================================================
// CONNECTOR ICON HELPER
// ============================================================================

function getConnectorIcon(
  category: string,
  size = 20,
  className = "text-muted-foreground"
) {
  switch (category) {
    case "database":
      return <DatabaseIcon size={size} className={className} />;
    case "data_warehouse":
      return <ServerIcon size={size} className={className} />;
    case "storage":
      return <FolderIcon size={size} className={className} />;
    case "crm":
      return <UsersIcon size={size} className={className} />;
    case "marketing":
      return <BarChartIcon size={size} className={className} />;
    case "ecommerce":
      return <ShoppingCartIcon size={size} className={className} />;
    case "productivity":
      return <GridIcon size={size} className={className} />;
    case "file":
      return <FileIcon size={size} className={className} />;
    case "finance":
      return <DollarIcon size={size} className={className} />;
    case "api":
      return <GlobeIcon size={size} className={className} />;
    case "cloud":
      return <CloudIcon size={size} className={className} />;
    default:
      return <DatabaseIcon size={size} className={className} />;
  }
}

// ============================================================================
// CONNECTOR CARD
// ============================================================================

interface ConnectorCardProps {
  connector: Connector;
  onSelect: (connector: Connector) => void;
}

function ConnectorCard({ connector, onSelect }: ConnectorCardProps) {
  return (
    <button
      onClick={() => onSelect(connector)}
      className="flex items-center gap-3 p-3 bg-secondary/50 hover:bg-secondary border border-border rounded-lg transition-colors text-left w-full"
    >
      <div className="p-2 bg-background rounded-lg">
        {getConnectorIcon(connector.category)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground text-sm truncate">
          {connector.name}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {connector.category}
        </p>
      </div>
      <ChevronRightIcon size={16} className="text-muted-foreground" />
    </button>
  );
}

// ============================================================================
// STEP 1: SELECT CONNECTOR
// ============================================================================

interface SelectConnectorStepProps {
  onSelect: (connector: Connector) => void;
}

function SelectConnectorStep({ onSelect }: SelectConnectorStepProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const connectors = useConnectorStore((s) => s.connectors);
  const categories = useConnectorStore((s) => s.categories);
  const loading = useConnectorStore((s) => s.loading);
  const loadConnectors = useConnectorStore((s) => s.loadConnectors);
  const loadCategories = useConnectorStore((s) => s.loadCategories);

  useEffect(() => {
    void loadConnectors();
    void loadCategories();
  }, [loadConnectors, loadCategories]);

  // Filter connectors
  const filteredConnectors = connectors.filter((c) => {
    const matchesSearch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !selectedCategory || c.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <SearchIcon
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("connector.search_placeholder")}
          className="w-full pl-9 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {/* Categories */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-3 py-1 text-xs rounded-full transition-colors ${
            !selectedCategory
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          {t("common.all")}
        </button>
        {categories.slice(0, 6).map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              selectedCategory === cat.id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {cat.name} ({cat.count})
          </button>
        ))}
      </div>

      {/* Connectors grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
        {filteredConnectors.length === 0 ? (
          <p className="col-span-2 text-center text-muted-foreground py-8 text-sm">
            {t("connector.no_results")}
          </p>
        ) : (
          filteredConnectors.slice(0, 50).map((connector) => (
            <ConnectorCard
              key={connector.id}
              connector={connector}
              onSelect={onSelect}
            />
          ))
        )}
      </div>

      {filteredConnectors.length > 50 && (
        <p className="text-xs text-muted-foreground text-center">
          {t("connector.showing_first", {
            count: 50,
            total: filteredConnectors.length,
          })}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// STEP 2: CONFIGURE CONNECTION
// ============================================================================

interface ConfigureConnectionStepProps {
  connector: Connector;
  onBack: () => void;
  onNext: (config: Record<string, unknown>) => void;
}

function ConfigureConnectionStep({
  connector,
  onBack,
  onNext,
}: ConfigureConnectionStepProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  const connectorSpec = useConnectorStore((s) => s.connectorSpec);
  const loadingSpec = useConnectorStore((s) => s.loadingSpec);
  const testResult = useConnectorStore((s) => s.testResult);
  const testing = useConnectorStore((s) => s.testing);
  const testConnection = useConnectorStore((s) => s.testConnection);

  // UI Schema for better form rendering
  const uiSchema: UiSchema = {
    "ui:submitButtonOptions": { norender: true },
    password: { "ui:widget": "password" },
    api_key: { "ui:widget": "password" },
    secret: { "ui:widget": "password" },
    token: { "ui:widget": "password" },
  };

  const handleTest = async () => {
    await testConnection(formData);
  };

  const handleSubmit = () => {
    if (!testResult?.success) {
      toast.error(t("connector.test_required"));
      return;
    }
    onNext(formData);
  };

  if (loadingSpec) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">
          {t("connector.loading_spec")}
        </p>
      </div>
    );
  }

  if (!connectorSpec) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-status-error">{t("connector.spec_error")}</p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 text-sm text-primary hover:underline"
        >
          {t("common.back")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-h-[70vh]">
      {/* Connector header */}
      <div className="flex items-center gap-3 pb-3 border-b border-border flex-shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
        >
          <ArrowLeftIcon size={16} className="text-muted-foreground" />
        </button>
        <div className="p-2 bg-secondary rounded-lg">
          {getConnectorIcon(connector.category, 20, "text-primary")}
        </div>
        <div>
          <p className="font-medium text-foreground">{connector.name}</p>
          <p className="text-xs text-muted-foreground">
            {t("connector.configure_connection")}
          </p>
        </div>
      </div>

      {/* Dynamic form */}
      <div className="rjsf-container flex-1 min-h-0 overflow-y-auto pr-1">
        <Form
          schema={connectorSpec.config_schema as RJSFSchema}
          uiSchema={uiSchema}
          formData={formData}
          onChange={(e) => setFormData(e.formData || {})}
          validator={validator}
          liveValidate
        />
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`p-3 rounded-lg text-sm flex-shrink-0 ${
            testResult.success
              ? "bg-status-success/10 text-status-success"
              : "bg-status-error/10 text-status-error"
          }`}
        >
          {testResult.success ? (
            <span className="flex items-center gap-2">
              <CheckIcon size={14} />
              {t("connector.test_success")}
            </span>
          ) : (
            <div className="max-h-20 overflow-y-auto">
              <span className="flex items-center gap-2 mb-1">
                <CloseIcon size={14} />
                {t("connector.test_failed")}
              </span>
              <p className="text-xs opacity-80 break-words whitespace-pre-wrap">{testResult.message}</p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-2 flex-shrink-0 border-t border-border">
        <button
          onClick={() => void handleTest()}
          disabled={testing}
          className="px-4 py-2 bg-secondary text-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {testing ? (
            <>
              <span className="w-4 h-4 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
              {t("connector.testing")}
            </>
          ) : (
            t("connector.test_connection")
          )}
        </button>

        <button
          onClick={handleSubmit}
          disabled={!testResult?.success}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {t("common.next")}
          <ChevronRightIcon size={14} />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// STEP 3: SELECT TABLES
// ============================================================================

interface SelectTablesStepProps {
  connector: Connector;
  tables: DiscoveredTable[];
  selectedTables: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  onBack: () => void;
  onNext: () => void;
  loading: boolean;
}

function SelectTablesStep({
  connector,
  tables,
  selectedTables,
  onSelectionChange,
  onBack,
  onNext,
  loading,
}: SelectTablesStepProps) {
  const { t } = useTranslation();
  const [showFKWarning, setShowFKWarning] = useState(false);
  const [missingFKTables, setMissingFKTables] = useState<
    ReturnType<typeof findMissingFKTables>
  >([]);

  const handleNext = () => {
    if (selectedTables.size === 0) {
      toast.error(t("datasourceWizard.noTablesSelected"));
      return;
    }

    // Check for missing FK tables
    const missing = findMissingFKTables(tables, selectedTables);
    if (missing.length > 0) {
      setMissingFKTables(missing);
      setShowFKWarning(true);
    } else {
      onNext();
    }
  };

  const handleAddFKTables = (tableNames: string[]) => {
    const newSelection = new Set(selectedTables);
    for (const tableName of tableNames) {
      // Find the full table name
      const table = tables.find((t) => t.name === tableName);
      if (table) {
        const key =
          table.schema && table.schema !== "public"
            ? `${table.schema}.${table.name}`
            : table.name;
        newSelection.add(key);
      }
    }
    onSelectionChange(newSelection);
    onNext();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">
          {t("datasourceWizard.discovering")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-border">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
        >
          <ArrowLeftIcon size={16} className="text-muted-foreground" />
        </button>
        <div className="p-2 bg-secondary rounded-lg">
          {getConnectorIcon(connector.category, 20, "text-primary")}
        </div>
        <div>
          <p className="font-medium text-foreground">
            {t("datasourceWizard.step3Title")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("datasourceWizard.step3Subtitle")}
          </p>
        </div>
      </div>

      {/* Table selector */}
      <div className="max-h-[50vh] overflow-y-auto">
        <TableSelector
          tables={tables}
          selectedTables={selectedTables}
          onSelectionChange={onSelectionChange}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-2 border-t border-border">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("common.back")}
        </button>
        <button
          onClick={handleNext}
          disabled={selectedTables.size === 0}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {t("common.next")}
          <ChevronRightIcon size={14} />
        </button>
      </div>

      {/* FK Warning Dialog */}
      <FKWarningDialog
        open={showFKWarning}
        onOpenChange={setShowFKWarning}
        missingTables={missingFKTables}
        onContinueWithout={onNext}
        onAddTables={handleAddFKTables}
      />
    </div>
  );
}

// ============================================================================
// STEP 4: SYNC MODE
// ============================================================================

interface SyncModeStepProps {
  connector: Connector;
  syncMode: SyncMode;
  onModeChange: (mode: SyncMode) => void;
  onBack: () => void;
  onNext: () => void;
}

function SyncModeStep({
  connector,
  syncMode,
  onModeChange,
  onBack,
  onNext,
}: SyncModeStepProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-border">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
        >
          <ArrowLeftIcon size={16} className="text-muted-foreground" />
        </button>
        <div className="p-2 bg-secondary rounded-lg">
          {getConnectorIcon(connector.category, 20, "text-primary")}
        </div>
        <div>
          <p className="font-medium text-foreground">
            {t("datasourceWizard.step4Title")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("datasourceWizard.step4Subtitle")}
          </p>
        </div>
      </div>

      {/* Sync mode selector */}
      <SyncModeSelector value={syncMode} onChange={onModeChange} />

      {/* Actions */}
      <div className="flex justify-between pt-2 border-t border-border">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("common.back")}
        </button>
        <button
          onClick={onNext}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          {t("common.next")}
          <ChevronRightIcon size={14} />
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// STEP 5: FINALIZE AND CREATE
// ============================================================================

interface FinalizeStepProps {
  connector: Connector;
  config: Record<string, unknown>;
  tables: DiscoveredTable[];
  selectedTables: Set<string>;
  syncMode: SyncMode;
  datasetId: string;
  onBack: () => void;
  onCreated: () => void;
}

function FinalizeStep({
  connector,
  config,
  tables,
  selectedTables,
  syncMode,
  datasetId,
  onBack,
  onCreated,
}: FinalizeStepProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(`${connector.name} Source`);
  const [description, setDescription] = useState("");
  const [syncAfterCreate, setSyncAfterCreate] = useState(true);
  const [creating, setCreating] = useState(false);

  // Use store for sync (proper architecture)
  const triggerSync = useDatasourceStore((s) => s.triggerSync);
  const loadDatasources = useDatasourceStore((s) => s.loadDatasources);

  // Calculate stats
  const selectedTablesList = tables.filter((t) => {
    const key =
      t.schema && t.schema !== "public" ? `${t.schema}.${t.name}` : t.name;
    return selectedTables.has(key);
  });
  const totalRows = selectedTablesList.reduce(
    (sum, t) => sum + (t.row_count || 0),
    0
  );

  // Build ingestion catalog
  const buildIngestionCatalog = (): IngestionCatalog => {
    return {
      discovered_at: new Date().toISOString(),
      tables: selectedTablesList.map((t) => ({
        schema: t.schema,
        name: t.name,
        enabled: true,
        row_count: t.row_count,
        columns: t.columns,
        primary_key: t.primary_key,
        foreign_keys: t.foreign_keys,
      })),
    };
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error(t("validation.required"));
      return;
    }

    setCreating(true);
    try {
      const response = await api.createDatasource({
        name: name.trim(),
        dataset_id: datasetId,
        source_type: connector.id,
        description: description.trim() || undefined,
        sync_config: config,
        sync_mode: syncMode,
        ingestion_catalog: buildIngestionCatalog(),
      });

      toast.success(t("datasource.created"));

      // Reload datasources to include the new one in the store
      await loadDatasources(datasetId, true);

      // Trigger sync if requested - use store action (proper architecture)
      if (syncAfterCreate && response.id) {
        // triggerSync handles: optimistic update, toast with Runs link, returns task_id
        await triggerSync(response.id);
      }

      onCreated();
    } catch (e) {
      const errorMsg =
        e instanceof Error ? e.message : t("datasource.create_error");
      toast.error(errorMsg);
    } finally {
      setCreating(false);
    }
  };

  // Get server info from config
  const serverInfo = config.host
    ? `${config.host}:${config.port || 5432}`
    : "N/A";
  const databaseInfo = (config.database as string) || "N/A";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-border">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
        >
          <ArrowLeftIcon size={16} className="text-muted-foreground" />
        </button>
        <div className="p-2 bg-secondary rounded-lg">
          {getConnectorIcon(connector.category, 20, "text-primary")}
        </div>
        <div>
          <p className="font-medium text-foreground">
            {t("datasourceWizard.step5Title")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("datasourceWizard.step5Subtitle")}
          </p>
        </div>
      </div>

      {/* Name input */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          {t("datasets.name")} *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder={t("datasource.name_placeholder")}
        />
      </div>

      {/* Description input */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          {t("datasets.description")}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          placeholder={t("datasets.description_placeholder")}
        />
      </div>

      {/* Summary */}
      <div className="bg-secondary/50 rounded-lg p-4 space-y-2">
        <p className="text-sm font-medium text-foreground">
          {t("datasourceWizard.summary")}
        </p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">
              {t("datasourceWizard.connector")}:
            </span>
          </div>
          <div className="text-foreground">{connector.name}</div>

          <div>
            <span className="text-muted-foreground">
              {t("datasourceWizard.server")}:
            </span>
          </div>
          <div className="text-foreground truncate">{serverInfo}</div>

          <div>
            <span className="text-muted-foreground">
              {t("datasourceWizard.database")}:
            </span>
          </div>
          <div className="text-foreground">{databaseInfo}</div>

          <div>
            <span className="text-muted-foreground">
              {t("datasourceWizard.tables")}:
            </span>
          </div>
          <div className="text-foreground">
            {selectedTables.size} {t("datasourceWizard.tables")}
          </div>

          <div>
            <span className="text-muted-foreground">
              {t("datasourceWizard.estimatedRows")}:
            </span>
          </div>
          <div className="text-foreground">~{totalRows.toLocaleString()}</div>

          <div>
            <span className="text-muted-foreground">
              {t("datasourceWizard.mode")}:
            </span>
          </div>
          <div className="text-foreground">
            {syncMode === "full_refresh"
              ? t("datasourceWizard.fullRefresh")
              : t("datasourceWizard.incremental")}
          </div>
        </div>
      </div>

      {/* Sync after create checkbox */}
      <div
        className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg cursor-pointer"
        onClick={() => setSyncAfterCreate(!syncAfterCreate)}
      >
        <Checkbox
          checked={syncAfterCreate}
          onCheckedChange={(checked) => setSyncAfterCreate(checked === true)}
        />
        <span className="text-sm text-foreground">
          {t("datasourceWizard.syncAfterCreate")}
        </span>
      </div>

      {/* Create button */}
      <button
        onClick={() => void handleCreate()}
        disabled={creating || !name.trim()}
        className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {creating ? (
          <>
            <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            {t("common.saving")}
          </>
        ) : (
          <>
            <CheckIcon size={14} />
            {t("datasource.create")}
          </>
        )}
      </button>
    </div>
  );
}

// ============================================================================
// MAIN WIZARD
// ============================================================================

export function CreateDatasourceWizard({
  isOpen,
  datasetId,
  onClose,
  onCreated,
}: CreateDatasourceWizardProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<WizardStep>("select");
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(
    null
  );
  const [connectionConfig, setConnectionConfig] = useState<
    Record<string, unknown>
  >({});
  const [discoveredTables, setDiscoveredTables] = useState<DiscoveredTable[]>(
    []
  );
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [syncMode, setSyncMode] = useState<SyncMode>("full_refresh");
  const [discovering, setDiscovering] = useState(false);

  const selectConnector = useConnectorStore((s) => s.selectConnector);
  const resetWizard = useConnectorStore((s) => s.resetWizard);

  // Reset on close
  const handleClose = useCallback(() => {
    setStep("select");
    setSelectedConnector(null);
    setConnectionConfig({});
    setDiscoveredTables([]);
    setSelectedTables(new Set());
    setSyncMode("full_refresh");
    resetWizard();
    onClose();
  }, [onClose, resetWizard]);

  // Handle connector selection
  const handleSelectConnector = async (connector: Connector) => {
    setSelectedConnector(connector);
    await selectConnector(connector);
    setStep("configure");
  };

  // Handle config completion - trigger discovery
  const handleConfigComplete = async (config: Record<string, unknown>) => {
    setConnectionConfig(config);
    setStep("tables");
    setDiscovering(true);

    try {
      if (!selectedConnector) return;

      const catalog = await api.discoverCatalog(selectedConnector.id, config);
      setDiscoveredTables(catalog.tables || []);

      // Pre-select all non-system tables
      const nonSystemTables = (catalog.tables || []).filter(
        (t: DiscoveredTable) =>
          !t.name.startsWith("_") && !t.name.startsWith("raw")
      );
      const initialSelection = new Set(
        nonSystemTables.map((t: DiscoveredTable) =>
          t.schema && t.schema !== "public" ? `${t.schema}.${t.name}` : t.name
        )
      );
      setSelectedTables(initialSelection);

      toast.success(
        t("connector.discover_success", { count: catalog.tables?.length || 0 })
      );
    } catch (e) {
      const errorMsg =
        e instanceof Error ? e.message : t("connector.discover_error");
      toast.error(errorMsg);
    } finally {
      setDiscovering(false);
    }
  };

  // Handle creation complete
  const handleCreated = () => {
    // Ne pas appeler clearDatasources() ici - le store a déjà les données à jour
    // avec le statut optimiste "running" si syncAfterCreate était activé
    handleClose();
    onCreated();
  };

  // Get step number for display
  const getStepNumber = (): string => {
    switch (step) {
      case "select":
        return "1";
      case "configure":
        return "2";
      case "tables":
        return "3";
      case "mode":
        return "4";
      case "finalize":
        return "5";
    }
  };

  // Get step label
  const getStepLabel = (): string => {
    switch (step) {
      case "select":
        return t("datasource.step_select");
      case "configure":
        return t("datasource.step_configure");
      case "tables":
        return t("datasourceWizard.step3Title");
      case "mode":
        return t("datasourceWizard.step4Title");
      case "finalize":
        return t("datasourceWizard.step5Title");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {t("datasource.add_title")}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("common.step")} {getStepNumber()}/5 &bull; {getStepLabel()}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto">
          {step === "select" && (
            <SelectConnectorStep
              onSelect={(c) => void handleSelectConnector(c)}
            />
          )}

          {step === "configure" && selectedConnector && (
            <ConfigureConnectionStep
              connector={selectedConnector}
              onBack={() => setStep("select")}
              onNext={(config) => void handleConfigComplete(config)}
            />
          )}

          {step === "tables" && selectedConnector && (
            <SelectTablesStep
              connector={selectedConnector}
              tables={discoveredTables}
              selectedTables={selectedTables}
              onSelectionChange={setSelectedTables}
              onBack={() => setStep("configure")}
              onNext={() => setStep("mode")}
              loading={discovering}
            />
          )}

          {step === "mode" && selectedConnector && (
            <SyncModeStep
              connector={selectedConnector}
              syncMode={syncMode}
              onModeChange={setSyncMode}
              onBack={() => setStep("tables")}
              onNext={() => setStep("finalize")}
            />
          )}

          {step === "finalize" && selectedConnector && (
            <FinalizeStep
              connector={selectedConnector}
              config={connectionConfig}
              tables={discoveredTables}
              selectedTables={selectedTables}
              syncMode={syncMode}
              datasetId={datasetId}
              onBack={() => setStep("mode")}
              onCreated={handleCreated}
            />
          )}
        </div>
      </div>
    </div>
  );
}
