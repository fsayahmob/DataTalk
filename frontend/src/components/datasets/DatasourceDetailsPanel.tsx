"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  DatabaseIcon,
  CloseIcon,
  TableIcon,
  SettingsIcon,
  ClockIcon,
  AlertIcon,
  RefreshIcon,
} from "@/components/icons";
import { DatasourceSyncBadge } from "./DatasourceSyncBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDateFR } from "@/lib/utils";
import { getConnectorName } from "@/lib/connectors";
import { useTranslation } from "@/hooks/useTranslation";
import { useDatasourceStore } from "@/stores/useDatasourceStore";
import * as api from "@/lib/api";
import type { Datasource, IngestionCatalog } from "@/lib/api";

interface DatasourceDetailsPanelProps {
  datasource: Datasource;
  onClose: () => void;
}

// Champs sensibles à masquer
const SENSITIVE_FIELDS = ["password", "api_key", "secret", "token", "credentials", "private_key"];

function isSensitiveField(key: string): boolean {
  return SENSITIVE_FIELDS.some((field) => key.toLowerCase().includes(field));
}

function maskValue(value: unknown): string {
  if (typeof value === "string" && value.length > 0) {
    return "••••••••";
  }
  return "••••••••";
}

function formatConfigValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

export function DatasourceDetailsPanel({
  datasource,
  onClose,
}: DatasourceDetailsPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"config" | "tables" | "sync">("tables");
  const [saving, setSaving] = useState(false);
  const [syncAfterSave, setSyncAfterSave] = useState(true);

  // Store pour les actions
  const loadDatasources = useDatasourceStore((s) => s.loadDatasources);
  const triggerSync = useDatasourceStore((s) => s.triggerSync);

  // État local pour les tables (permet de modifier avant sauvegarde)
  const initialTables = datasource.ingestion_catalog?.tables || [];
  const [tables, setTables] = useState(initialTables);
  const [hasChanges, setHasChanges] = useState(false);

  const config = datasource.sync_config || {};
  const enabledTables = tables.filter((t) => t.enabled !== false);

  // Toggle une table
  const handleToggleTable = useCallback((tableName: string) => {
    setTables((prev) =>
      prev.map((t) =>
        t.name === tableName ? { ...t, enabled: t.enabled === false ? true : false } : t
      )
    );
    setHasChanges(true);
  }, []);

  // Sauvegarder les changements
  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedCatalog: IngestionCatalog = {
        discovered_at: datasource.ingestion_catalog?.discovered_at || new Date().toISOString(),
        tables,
      };

      await api.updateDatasource(datasource.id, {
        ingestion_catalog: updatedCatalog,
      });

      // Rafraîchir la liste
      if (datasource.dataset_id) {
        void loadDatasources(datasource.dataset_id, true);
      }

      // Si syncAfterSave, relancer la sync
      if (syncAfterSave) {
        await triggerSync(datasource.id);
        toast.success(t("datasource.tables_updated_sync_started"));
        onClose();
      } else {
        toast.success(t("datasource.tables_updated"));
        setHasChanges(false);
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : t("common.error");
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-secondary rounded-lg">
              <DatabaseIcon size={20} className="text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">{datasource.name}</h2>
              <p className="text-xs text-muted-foreground">
                {getConnectorName(datasource.source_type)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <DatasourceSyncBadge status={datasource.sync_status} />
            <Button variant="ghost" size="icon" onClick={onClose}>
              <CloseIcon size={18} />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab("tables")}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "tables"
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TableIcon size={14} className="inline mr-1.5" />
            {t("datasource.tables")} ({enabledTables.length}/{tables.length})
          </button>
          <button
            onClick={() => setActiveTab("config")}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "config"
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <SettingsIcon size={14} className="inline mr-1.5" />
            {t("datasource.configuration")}
          </button>
          <button
            onClick={() => setActiveTab("sync")}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "sync"
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ClockIcon size={14} className="inline mr-1.5" />
            {t("datasource.sync_history")}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {/* Tables Tab */}
          {activeTab === "tables" && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground mb-4">
                {t("datasource.tables_edit_notice")}
              </div>

              {tables.length === 0 ? (
                <div className="text-sm text-muted-foreground italic">
                  {t("datasource.no_tables")}
                </div>
              ) : (
                tables.map((table) => {
                  const isEnabled = table.enabled !== false;
                  return (
                    <div
                      key={table.name}
                      className={`flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer transition-colors ${
                        isEnabled
                          ? "bg-secondary/50 hover:bg-secondary/70"
                          : "bg-secondary/20 hover:bg-secondary/30"
                      }`}
                      onClick={() => handleToggleTable(table.name)}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={isEnabled}
                          onCheckedChange={() => handleToggleTable(table.name)}
                        />
                        <TableIcon
                          size={14}
                          className={isEnabled ? "text-muted-foreground" : "text-muted-foreground/50"}
                        />
                        <span
                          className={`text-sm font-mono ${
                            isEnabled ? "text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {table.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {table.row_count !== undefined && (
                          <span className="text-xs text-muted-foreground">
                            {table.row_count.toLocaleString()} rows
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Actions pour les tables */}
              {hasChanges && (
                <div className="mt-4 pt-4 border-t border-border space-y-3">
                  {/* Checkbox sync après save */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={syncAfterSave}
                      onCheckedChange={(checked) => setSyncAfterSave(checked === true)}
                    />
                    <span className="text-sm text-muted-foreground">
                      {t("datasource.sync_after_save")}
                    </span>
                  </label>

                  {/* Bouton save */}
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full gap-1.5"
                  >
                    {syncAfterSave && <RefreshIcon size={14} />}
                    {saving
                      ? t("common.saving")
                      : syncAfterSave
                        ? t("datasource.save_and_sync")
                        : t("common.save")}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Configuration Tab */}
          {activeTab === "config" && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground mb-4">
                {t("datasource.config_readonly_notice")}
              </div>

              {Object.entries(config).length === 0 ? (
                <div className="text-sm text-muted-foreground italic">
                  {t("datasource.no_config")}
                </div>
              ) : (
                <div className="grid gap-2">
                  {Object.entries(config).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between py-2 px-3 bg-secondary/50 rounded-lg"
                    >
                      <span className="text-sm text-muted-foreground font-mono">
                        {key}
                      </span>
                      <span className="text-sm text-foreground font-mono">
                        {isSensitiveField(key)
                          ? maskValue(value)
                          : formatConfigValue(value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Sync mode */}
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between py-2 px-3 bg-secondary/50 rounded-lg">
                  <span className="text-sm text-muted-foreground">
                    {t("datasource.sync_mode")}
                  </span>
                  <span className="text-sm text-foreground font-medium">
                    {datasource.sync_mode === "full_refresh"
                      ? t("datasource.mode_full_refresh")
                      : t("datasource.mode_incremental")}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Sync History Tab */}
          {activeTab === "sync" && (
            <div className="space-y-4">
              {/* Last sync summary */}
              <div className="bg-secondary/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-foreground mb-3">
                  {t("datasource.last_sync")}
                </h4>

                {datasource.last_sync_at ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t("common.date")}</span>
                      <span className="text-foreground">
                        {formatDateFR(datasource.last_sync_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t("common.status")}</span>
                      <DatasourceSyncBadge status={datasource.sync_status} />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {t("datasource.tables_synced")}
                      </span>
                      <span className="text-foreground">{enabledTables.length}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">
                    {t("datasource.never_synced")}
                  </div>
                )}
              </div>

              {/* Error details if any */}
              {datasource.sync_status === "error" && datasource.last_sync_error && (
                <div className="bg-status-error/10 border border-status-error/20 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertIcon size={16} className="text-status-error mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-status-error mb-1">
                        {t("datasource.sync_error")}
                      </h4>
                      <p className="text-xs text-status-error/80 font-mono whitespace-pre-wrap">
                        {datasource.last_sync_error}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Info about viewing detailed logs */}
              <div className="text-xs text-muted-foreground">
                {t("datasource.view_detailed_logs_hint")}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-secondary/30">
          <div className="text-xs text-muted-foreground">
            {t("common.created")}: {formatDateFR(datasource.created_at)}
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
